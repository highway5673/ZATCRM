import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { parseVoiceFormAudio, type VoiceFormType, type VoiceParsedFields } from '../lib/voice'

type VoiceInputButtonProps<T extends VoiceParsedFields> = {
  formType: VoiceFormType
  title: string
  scriptLines: string[]
  onApply: (fields: T) => void
  onSubmit: (fields: T) => Promise<void>
  disabled?: boolean
}

export function VoiceInputButton<T extends VoiceParsedFields>({
  formType,
  title,
  scriptLines,
  onApply,
  onSubmit,
  disabled,
}: VoiceInputButtonProps<T>) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('按下录音后，照着格式说即可')
  const [transcript, setTranscript] = useState('')
  const [fields, setFields] = useState<T | null>(null)

  const elapsed = useMemo(() => {
    const seconds = Math.floor((recorderState.durationMillis ?? 0) / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }, [recorderState.durationMillis])

  const reset = () => {
    setStatus('按下录音后，照着格式说即可')
    setTranscript('')
    setFields(null)
    setBusy(false)
  }

  const open = () => {
    reset()
    setVisible(true)
  }

  const close = async () => {
    if (recorderState.isRecording) await recorder.stop()
    setVisible(false)
    reset()
  }

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('需要麦克风权限', '请允许访问麦克风后再使用语音输入')
        return
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      })
      await recorder.prepareToRecordAsync()
      recorder.record()
      setStatus('正在录音，请按台词格式说话')
      setTranscript('')
      setFields(null)
    } catch (error) {
      Alert.alert('录音失败', error instanceof Error ? error.message : '无法启动录音')
    }
  }

  const stopAndRecognize = async () => {
    try {
      setBusy(true)
      setStatus('正在识别并整理字段...')
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) throw new Error('没有拿到录音文件')

      const result = await parseVoiceFormAudio<T>({ uri, formType })
      setTranscript(result.transcript)
      setFields(result.fields)
      setStatus('已整理好，可以确认提交')
    } catch (error) {
      setStatus('识别失败，请重试')
      Alert.alert('识别失败', error instanceof Error ? error.message : '语音识别失败')
    } finally {
      setBusy(false)
    }
  }

  const submitRecognized = async () => {
    if (!fields) return
    try {
      setBusy(true)
      onApply(fields)
      await onSubmit(fields)
      setVisible(false)
      reset()
    } catch (error) {
      Alert.alert('提交失败', error instanceof Error ? error.message : '请检查识别内容后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TouchableOpacity
        className="flex-row items-center justify-center rounded-xl border border-[#007AFF] bg-blue-50 px-4 py-3"
        onPress={open}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Text className="text-[#007AFF] text-base font-semibold">语音输入</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-[#F2F2F7]">
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3 bg-white border-b border-gray-100">
            <TouchableOpacity onPress={close} disabled={busy}>
              <Text className="text-gray-500 text-base">取消</Text>
            </TouchableOpacity>
            <Text className="text-base font-semibold text-gray-900">{title}</Text>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <View className="bg-[#0B0B0F] rounded-2xl p-5 min-h-[260px]">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-white text-lg font-semibold">台词提示器</Text>
                <Text className="text-[#64D2FF] text-sm font-semibold">{elapsed}</Text>
              </View>

              {scriptLines.map((line, index) => (
                <Text key={line} className="text-white text-xl leading-8 mb-3">
                  <Text className="text-[#64D2FF]">{index + 1}. </Text>
                  {line}
                </Text>
              ))}

              <View className="mt-2 rounded-xl bg-white/10 px-4 py-3">
                <Text className="text-gray-200 text-sm leading-5">{status}</Text>
              </View>
            </View>

            <TouchableOpacity
              className={`mt-4 rounded-2xl py-4 items-center ${
                recorderState.isRecording ? 'bg-red-500' : 'bg-[#007AFF]'
              }`}
              onPress={recorderState.isRecording ? stopAndRecognize : startRecording}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white text-base font-bold">
                  {recorderState.isRecording ? '停止并识别' : '开始录音'}
                </Text>
              )}
            </TouchableOpacity>

            {transcript ? (
              <View className="mt-4 bg-white rounded-2xl p-4">
                <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">识别文本</Text>
                <Text className="text-gray-700 text-sm leading-5">{transcript}</Text>
              </View>
            ) : null}

            {fields ? (
              <View className="mt-4 bg-white rounded-2xl p-4">
                <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">字段预览</Text>
                {Object.entries(fields).map(([key, value]) => (
                  <View key={key} className="flex-row py-2 border-b border-gray-50">
                    <Text className="text-gray-400 text-sm w-24">{key}</Text>
                    <Text className="text-gray-800 text-sm flex-1">{value == null ? '未识别' : String(value)}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  className="mt-4 bg-[#34C759] rounded-xl py-3 items-center"
                  onPress={submitRecognized}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-white text-base font-semibold">填入并提交</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}
