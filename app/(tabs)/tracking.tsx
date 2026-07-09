import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, TextInput,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { resolveVisitLocation } from '../../lib/location'
import type { TrackingMethod } from '../../types/database'

const METHODS: { key: TrackingMethod; label: string; emoji: string; hasGps: boolean }[] = [
  { key: 'visit',  label: '上门拜访', emoji: '🚗', hasGps: true },
  { key: 'phone',  label: '电话',     emoji: '📞', hasGps: false },
  { key: 'wechat', label: '微信',     emoji: '💬', hasGps: false },
  { key: 'email',  label: '邮件',     emoji: '📧', hasGps: false },
  { key: 'other',  label: '其他',     emoji: '📝', hasGps: false },
]

const METHOD_MAP = Object.fromEntries(METHODS.map(m => [m.key, m]))

type CustomerOption = { id: string; name: string; company: string | null }

type TrackingWithCustomer = {
  id: string
  customer_id: string
  method: TrackingMethod
  content: string
  location_id: string | null
  tracked_at: string
  customers: { name: string; company: string | null } | null
  customer_locations: { address: string | null } | null
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function AddTrackingModal({
  visible,
  onClose,
  onSaved,
  defaultCustomerId,
}: {
  visible: boolean
  onClose: () => void
  onSaved: () => void
  defaultCustomerId?: string
}) {
  const [method, setMethod] = useState<TrackingMethod>('phone')
  const [content, setContent] = useState('')
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [saving, setSaving] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setCustomerId(defaultCustomerId ?? '')
      supabase.from('customers').select('id, name, company').order('name').then(({ data }) => {
        if (data) setCustomers(data)
      })
    }
  }, [visible, defaultCustomerId])

  const reset = () => {
    setMethod('phone')
    setContent('')
    setCustomerId(defaultCustomerId ?? '')
    setGpsStatus(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleSave = async () => {
    if (!customerId) { Alert.alert('提示', '请选择客户'); return }
    if (!content.trim()) { Alert.alert('提示', '请输入跟踪内容'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    let locationId: string | null = null

    if (method === 'visit') {
      setGpsStatus('获取位置中...')
      const loc = await resolveVisitLocation(customerId)
      if (loc) {
        locationId = loc.locationId
        setGpsStatus(loc.address ? `📍 ${loc.address}` : '📍 已记录位置')
      } else {
        setGpsStatus('⚠️ 无法获取位置，已跳过')
      }
    }

    const { error } = await supabase.from('tracking_records').insert({
      user_id: user.id,
      customer_id: customerId,
      method,
      content: content.trim(),
      location_id: locationId,
      tracked_at: new Date().toISOString(),
    })

    setSaving(false)
    if (error) {
      Alert.alert('保存失败', error.message)
    } else {
      reset()
      onSaved()
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        className="flex-1 bg-[#F2F2F7]"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3 bg-white border-b border-gray-100">
          <TouchableOpacity onPress={handleClose}>
            <Text className="text-gray-500 text-base">取消</Text>
          </TouchableOpacity>
          <Text className="text-base font-semibold text-gray-800">新增跟踪</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#007AFF" />
              : <Text className="text-[#007AFF] text-base font-semibold">保存</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          {/* 跟踪方式 */}
          <View className="mx-4 mt-4 bg-white rounded-2xl p-4">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">跟踪方式</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {METHODS.map(m => (
                  <TouchableOpacity
                    key={m.key}
                    onPress={() => setMethod(m.key)}
                    className={`px-3 py-2.5 rounded-xl border items-center min-w-[64px] ${
                      method === m.key
                        ? 'bg-[#007AFF] border-[#007AFF]'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text className="text-lg">{m.emoji}</Text>
                    <Text className={`text-xs mt-0.5 ${method === m.key ? 'text-white' : 'text-gray-500'}`}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {METHOD_MAP[method]?.hasGps && (
              <Text className="text-xs text-gray-400 mt-3">
                {gpsStatus ?? '保存时将自动记录GPS位置'}
              </Text>
            )}
          </View>

          {/* 关联客户 */}
          {!defaultCustomerId && (
            <View className="mx-4 mt-4 bg-white rounded-2xl p-4">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">关联客户 *</Text>
              {customers.length === 0 ? (
                <Text className="text-gray-400 text-sm">请先在客户页添加客户</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {customers.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setCustomerId(c.id)}
                        className={`px-3 py-2 rounded-xl border ${
                          customerId === c.id
                            ? 'bg-[#007AFF] border-[#007AFF]'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <Text className={`text-sm font-medium ${customerId === c.id ? 'text-white' : 'text-gray-700'}`}>
                          {c.name}
                        </Text>
                        {c.company && (
                          <Text className={`text-xs ${customerId === c.id ? 'text-blue-100' : 'text-gray-400'}`}>
                            {c.company}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          )}

          {/* 跟踪内容 */}
          <View className="mx-4 mt-4 mb-8 bg-white rounded-2xl p-4">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">跟踪内容 *</Text>
            <TextInput
              className="text-base text-gray-900"
              placeholder="记录本次跟踪内容..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              value={content}
              onChangeText={setContent}
              style={{ minHeight: 120 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function TrackingCard({ item }: { item: TrackingWithCustomer }) {
  const m = METHOD_MAP[item.method]
  return (
    <View className="bg-white rounded-2xl p-4 mb-3">
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-row items-center gap-2 flex-1">
          <Text className="text-lg">{m?.emoji ?? '📝'}</Text>
          <View className="flex-1">
            <Text className="text-gray-800 font-semibold text-sm">
              {item.customers?.name ?? '—'}
            </Text>
            {item.customers?.company && (
              <Text className="text-gray-400 text-xs">{item.customers.company}</Text>
            )}
          </View>
        </View>
        <Text className="text-xs text-gray-300 mt-0.5">{formatDate(item.tracked_at)}</Text>
      </View>
      <Text className="text-gray-600 text-sm leading-5">{item.content}</Text>
      {item.customer_locations?.address && (
        <View className="flex-row items-center mt-2 gap-1">
          <Text className="text-gray-300 text-xs">📍 {item.customer_locations.address}</Text>
        </View>
      )}
    </View>
  )
}

export default function TrackingScreen() {
  const router = useRouter()
  const [records, setRecords] = useState<TrackingWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<TrackingMethod | 'all'>('all')

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tracking_records')
      .select('*, customers(name, company), customer_locations(address)')
      .order('tracked_at', { ascending: false })
      .limit(100)

    if (!error && data) setRecords(data as unknown as TrackingWithCustomer[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const filtered = filter === 'all' ? records : records.filter(r => r.method === filter)

  const FILTER_OPTIONS: { key: TrackingMethod | 'all'; label: string }[] = [
    { key: 'all',   label: '全部' },
    { key: 'visit', label: '🚗拜访' },
    { key: 'phone', label: '📞电话' },
    { key: 'wechat',label: '💬微信' },
    { key: 'other', label: '其他' },
  ]

  return (
    <View className="flex-1 bg-[#F2F2F7]">
      <View className="bg-white px-5 pt-14 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-3xl font-bold text-gray-900">跟踪</Text>
          <TouchableOpacity
            className="bg-[#007AFF] w-9 h-9 rounded-full items-center justify-center"
            onPress={() => setShowAdd(true)}
          >
            <Text className="text-white text-2xl leading-none mt-[-1]">+</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {FILTER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setFilter(opt.key)}
                className={`px-4 py-1.5 rounded-full border ${
                  filter === opt.key
                    ? 'bg-[#007AFF] border-[#007AFF]'
                    : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm font-medium ${filter === opt.key ? 'text-white' : 'text-gray-500'}`}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => <TrackingCard item={item} />}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20">
              <Text className="text-5xl mb-4">📋</Text>
              <Text className="text-gray-400 text-base">暂无跟踪记录，点击 + 添加</Text>
            </View>
          }
        />
      )}

      <AddTrackingModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => {
          setShowAdd(false)
          fetchRecords()
        }}
      />
    </View>
  )
}
