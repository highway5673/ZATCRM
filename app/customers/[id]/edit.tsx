import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { trackPerf } from '../../../lib/perf'
import { AppHeader } from '../../../components/ui/AppHeader'
import type { Customer, CustomerType } from '../../../types/database'

const CUSTOMER_TYPES: CustomerType[] = ['潜在伙伴', '客户', '伙伴']

async function loadClipboard() {
  try {
    return await import('expo-clipboard')
  } catch {
    return null
  }
}

function extractWechatNickname(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const nicknameLine = lines.find(line => /^(微信昵称|昵称|微信名)[:：]/.test(line))
  if (nicknameLine) return nicknameLine.replace(/^(微信昵称|昵称|微信名)[:：]\s*/, '').trim()

  const nonWechatIdLine = lines.find(line => !/^微信号[:：]/.test(line))
  return (nonWechatIdLine ?? lines[0] ?? '').trim()
}

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [wechat, setWechat] = useState('')
  const [notes, setNotes] = useState('')
  const [customerType, setCustomerType] = useState<CustomerType>('潜在伙伴')
  const [selectingWechat, setSelectingWechat] = useState(false)
  const selectingWechatRef = useRef(false)
  const previousWechatClipboardRef = useRef('')

  useEffect(() => {
    trackPerf('customers.edit.load', () =>
      supabase.from('customers').select('*').eq('id', id).single(),
    { customerId: id }).then(({ data, error }) => {
      if (error || !data) {
        Alert.alert('加载失败', '无法读取客户信息')
        router.back()
        return
      }
      const customer = data as Customer
      setName(customer.name)
      setCompany(customer.company ?? '')
      setPhone(customer.phone ?? '')
      setWechat(customer.wechat ?? '')
      setNotes(customer.notes ?? '')
      setCustomerType(customer.customer_type)
      setLoading(false)
    })
  }, [id, router])

  const pasteWechatNickname = useCallback(async (showResult = true) => {
    const clipboard = await loadClipboard()
    if (!clipboard) {
      Alert.alert('剪贴板不可用', '当前模拟器 App 未包含剪贴板模块，请重新安装 Expo Go 或重建开发客户端。')
      return false
    }

    const copiedText = await clipboard.getStringAsync()
    if (!showResult && copiedText.trim() === previousWechatClipboardRef.current) {
      return false
    }

    const nextWechat = extractWechatNickname(copiedText)

    if (!nextWechat) {
      if (showResult) {
        Alert.alert('未读取到微信昵称', '请先在微信中复制昵称，然后回到这里再试。')
      }
      return false
    }

    setWechat(nextWechat)
    setSelectingWechat(false)
    selectingWechatRef.current = false

    if (showResult) {
      Alert.alert('已填入微信昵称', nextWechat)
    }
    return true
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && selectingWechatRef.current) {
        pasteWechatNickname(false)
      }
    })

    return () => subscription.remove()
  }, [pasteWechatNickname])

  const openWechatForNickname = async () => {
    const clipboard = await loadClipboard()
    previousWechatClipboardRef.current = clipboard
      ? (await clipboard.getStringAsync()).trim()
      : ''
    selectingWechatRef.current = true
    setSelectingWechat(true)

    try {
      await Linking.openURL('weixin://')
    } catch {
      Alert.alert('无法打开微信', '请手动打开微信，复制昵称后回到 CRM。')
    }
  }

  const handleSelectWechat = () => {
    Alert.alert(
      '选择微信昵称',
      '请在微信中打开对方资料页，复制昵称，然后回到 CRM。回到本页后会自动填入微信昵称。',
      [
        { text: '取消', style: 'cancel' },
        { text: '我已复制，粘贴', onPress: () => pasteWechatNickname() },
        { text: '打开微信', onPress: openWechatForNickname },
      ],
    )
  }

  const save = async () => {
    const nextName = name.trim()
    if (!nextName) {
      Alert.alert('保存失败', '请输入客户姓名')
      return
    }

    try {
      setSaving(true)
      const { error } = await trackPerf('customers.edit.update', () =>
        supabase.from('customers').update({
          name: nextName,
          company: company.trim() || null,
          phone: phone.trim() || null,
          wechat: wechat.trim() || null,
          notes: notes.trim() || null,
          customer_type: customerType,
        }).eq('id', id),
      { customerId: id, customerType })

      if (error) throw error
      router.back()
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-canvas items-center justify-center">
        <ActivityIndicator size="large" color="#0A3569" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AppHeader
        title="编辑客户"
        backLabel="取消"
        onBack={() => router.back()}
        actionLabel="保存"
        onAction={save}
        actionLoading={saving}
        actionDisabled={saving}
        actionTone="gold"
      />

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 36 }}>
        <View className="mx-4 mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <View className="px-4 pt-4 pb-2 border-b border-gray-50">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">姓名 *</Text>
            <TextInput
              className="text-base text-gray-900 pb-2"
              placeholder="请输入客户姓名"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />
          </View>
          <View className="px-4 pt-4 pb-2 border-b border-gray-50">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">公司</Text>
            <TextInput
              className="text-base text-gray-900 pb-2"
              placeholder="请输入公司名称"
              placeholderTextColor="#9CA3AF"
              value={company}
              onChangeText={setCompany}
            />
          </View>
          <View className="px-4 pt-4 pb-2 border-b border-gray-50">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">手机号</Text>
            <TextInput
              className="text-base text-gray-900 pb-2"
              placeholder="请输入手机号"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>
          <View className="px-4 pt-4 pb-2">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs text-gray-400 uppercase font-semibold">微信昵称</Text>
              <TouchableOpacity
                className="rounded-full bg-brand-50 px-3 py-1.5"
                onPress={handleSelectWechat}
                disabled={selectingWechat}
                activeOpacity={0.75}
              >
                <Text className="text-brand-700 text-sm font-semibold">
                  {selectingWechat ? '等待复制' : '选择微信'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              className="text-base text-gray-900 pb-2"
              placeholder="输入微信昵称"
              placeholderTextColor="#9CA3AF"
              value={wechat}
              onChangeText={setWechat}
            />
          </View>
        </View>

        <View className="mx-4 mt-4 rounded-2xl border border-line bg-white p-4 shadow-card">
          <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">客户类型</Text>
          <View className="flex-row gap-2">
            {CUSTOMER_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                onPress={() => setCustomerType(type)}
                className={`flex-1 py-2 rounded-lg border items-center ${
                  customerType === type ? 'bg-brand-700 border-brand-700' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm font-medium ${customerType === type ? 'text-white' : 'text-gray-600'}`}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="mx-4 mt-4 rounded-2xl border border-line bg-white p-4 shadow-card">
          <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">备注</Text>
          <TextInput
            className="text-base text-gray-900"
            placeholder="备注信息"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
            style={{ minHeight: 96 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
