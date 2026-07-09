import * as FileSystem from 'expo-file-system/legacy'

import { trackPerf } from './perf'
import { supabase } from './supabase'

export type VoiceFormType = 'customer' | 'tracking' | 'sales' | 'task'

export type VoiceParsedFields = Record<string, string | number | null | undefined>

type ParseVoiceOptions = {
  uri: string
  formType: VoiceFormType
}

type ParseVoiceResult<T extends VoiceParsedFields> = {
  transcript: string
  fields: T
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export async function parseVoiceFormAudio<T extends VoiceParsedFields>({
  uri,
  formType,
}: ParseVoiceOptions): Promise<ParseVoiceResult<T>> {
  const { data: { session } } = await trackPerf('voice.getSession', () => supabase.auth.getSession(), { formType })

  const res = await trackPerf('voice.uploadAndParse', () =>
    FileSystem.uploadAsync(`${supabaseUrl}/functions/v1/parse-voice-form`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'audio',
      mimeType: 'audio/m4a',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
      },
      parameters: { formType },
    }),
  { formType })

  const body = parseJson(res.body)
  if (res.status < 200 || res.status >= 300) {
    throw new Error(body?.error ?? '语音识别失败')
  }

  return body as ParseVoiceResult<T>
}

function parseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
