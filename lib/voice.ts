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
  const { data: { session } } = await supabase.auth.getSession()
  const formData = new FormData()
  formData.append('formType', formType)
  formData.append('audio', {
    uri,
    name: 'voice-form.m4a',
    type: 'audio/m4a',
  } as unknown as Blob)

  const res = await fetch(`${supabaseUrl}/functions/v1/parse-voice-form`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
    },
    body: formData,
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(body?.error ?? '语音识别失败')
  }

  return body as ParseVoiceResult<T>
}
