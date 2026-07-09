import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native'
import { supabase } from '../../lib/supabase'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
const COUNTDOWN_SECONDS = 60

async function callEdgeFn(path: string, body: Record<string, string>) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok && !data.error) return { error: '服务异常，请稍后重试' }
    return data
  } catch {
    return { error: '网络异常，请稍后重试' }
  }
}

export default function LoginScreen() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const otpRefs = useRef<(TextInput | null)[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function startCountdown() {
    setCountdown(COUNTDOWN_SECONDS)
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const normalizedPhone = phone.replace(/\D/g, '').replace(/^86/, '')

  const handleSendOtp = async () => {
    if (normalizedPhone.length !== 11) {
      Alert.alert('提示', '请输入正确的11位手机号')
      return
    }
    setLoading(true)
    const result = await callEdgeFn('send-otp', { phone: normalizedPhone })
    setLoading(false)
    if (result.error) {
      Alert.alert('发送失败', result.error)
      return
    }
    setStep('otp')
    startCountdown()
    setTimeout(() => otpRefs.current[0]?.focus(), 100)
  }

  const handleOtpChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
    if (next.every(d => d !== '') && next.join('').length === 6) {
      verifyAndLogin(next.join(''))
    }
  }

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  const verifyAndLogin = async (code: string) => {
    setLoading(true)
    const verifyResult = await callEdgeFn('verify-otp', { phone: normalizedPhone, code })
    if (verifyResult.error) {
      setLoading(false)
      Alert.alert('验证失败', verifyResult.error)
      setOtp(['', '', '', '', '', ''])
      otpRefs.current[0]?.focus()
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: verifyResult.email,
      password: verifyResult.sessionPassword,
    })
    if (authError) {
      Alert.alert('登录失败', authError.message)
    }
    setLoading(false)
  }

  const handleResend = async () => {
    if (countdown > 0) return
    setOtp(['', '', '', '', '', ''])
    await handleSendOtp()
  }

  if (step === 'phone') {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-[#F2F2F7]"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 justify-center px-8">
          <Text className="text-3xl font-bold text-gray-900 mb-1">销售CRM</Text>
          <Text className="text-gray-500 mb-10">输入手机号登录或注册</Text>

          <Text className="text-sm font-semibold text-gray-500 uppercase mb-2">手机号</Text>
          <View className="bg-white rounded-lg px-4 py-3.5 mb-6 flex-row items-center">
            <Text className="text-gray-400 mr-2">+86</Text>
            <TextInput
              className="flex-1 text-base text-gray-900"
              placeholder="请输入手机号"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={13}
              autoFocus
            />
          </View>

          <TouchableOpacity
            className="bg-primary-600 rounded-lg py-3.5 items-center"
            onPress={handleSendOtp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text className="text-white text-base font-semibold">获取验证码</Text>
            }
          </TouchableOpacity>

          <Text className="text-center text-gray-400 text-xs mt-6 leading-5">
            首次登录将自动创建账号{'\n'}无需单独注册
          </Text>
        </View>
      </KeyboardAvoidingView>
    )
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#F2F2F7]"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-8">
        <TouchableOpacity onPress={() => { setStep('phone'); setOtp(['', '', '', '', '', '']) }} className="mb-8">
          <Text className="text-primary-600 text-base">‹ 修改手机号</Text>
        </TouchableOpacity>

        <Text className="text-2xl font-bold text-gray-900 mb-1">输入验证码</Text>
        <Text className="text-gray-500 mb-8">已发送至 +86 {normalizedPhone}</Text>

        <View className="flex-row justify-between mb-8">
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={ref => { otpRefs.current[i] = ref }}
              className={`w-12 h-14 bg-white rounded-lg text-center text-xl font-bold text-gray-900 border-2 ${
                digit ? 'border-primary-600' : 'border-transparent'
              }`}
              keyboardType="number-pad"
              maxLength={2}
              value={digit}
              onChangeText={text => handleOtpChange(text, i)}
              onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
            />
          ))}
        </View>

        {loading && (
          <View className="items-center mb-4">
            <ActivityIndicator color="#007AFF" />
          </View>
        )}

        <TouchableOpacity
          onPress={handleResend}
          disabled={countdown > 0}
          className="items-center"
        >
          <Text className={`text-base ${countdown > 0 ? 'text-gray-400' : 'text-primary-600'}`}>
            {countdown > 0 ? `${countdown}秒后可重新获取` : '重新获取验证码'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
