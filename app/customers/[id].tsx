import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { formatLocationLabel, openNavigation, resolveAddressForCoords, resolveVisitLocation } from '../../lib/location'
import { perfLog, perfNow, trackPerf } from '../../lib/perf'
import { VoiceInputButton } from '../../components/VoiceInputButton'
import type {
  Customer, CustomerLocation, CustomerType, TrackingMethod, SalesRecord,
} from '../../types/database'

const METHODS: { key: TrackingMethod; label: string; emoji: string; hasGps: boolean }[] = [
  { key: 'visit',  label: '上门拜访', emoji: '🚗', hasGps: true },
  { key: 'phone',  label: '电话',     emoji: '📞', hasGps: false },
  { key: 'wechat', label: '微信',     emoji: '💬', hasGps: false },
  { key: 'email',  label: '邮件',     emoji: '📧', hasGps: false },
  { key: 'other',  label: '其他',     emoji: '📝', hasGps: false },
]
const METHOD_MAP = Object.fromEntries(METHODS.map(m => [m.key, m]))

const CUSTOMER_TYPES: CustomerType[] = ['潜在伙伴', '客户', '伙伴']
const TYPE_STYLE: Record<CustomerType, { bg: string; text: string }> = {
  '潜在伙伴': { bg: 'bg-gray-100', text: 'text-gray-500' },
  '客户':     { bg: 'bg-blue-50',  text: 'text-[#007AFF]' },
  '伙伴':     { bg: 'bg-green-50', text: 'text-green-600' },
}

const AVATAR_COLORS = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500']

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type TrackingRecord = {
  id: string
  method: TrackingMethod
  content: string
  tracked_at: string
  location_id: string | null
  customer_locations: Pick<CustomerLocation, 'address' | 'latitude' | 'longitude'> | null
  tracking_gifts: { id: string; name: string; quantity: number; unit: string | null }[] | null
}

type TrialItem = {
  id: string
  trackingRecordId: string
  name: string
  quantity: number
  unit: string | null
  notes: string
  trackedAt: string
}

type TrackingVoiceFields = {
  method?: TrackingMethod | null
  content?: string | null
  gift_name?: string | null
  gift_quantity?: number | null
}

type SalesVoiceFields = {
  product_name?: string | null
  quantity?: number | null
  unit?: string | null
  unit_price?: number | null
  amount?: number | null
  notes?: string | null
}

function AddTrackingModal({
  visible, customerId, onClose, onSaved,
}: {
  visible: boolean; customerId: string; onClose: () => void; onSaved: () => void
}) {
  const [method, setMethod] = useState<TrackingMethod>('phone')
  const [content, setContent] = useState('')
  const [giftName, setGiftName] = useState('')
  const [giftQuantity, setGiftQuantity] = useState('0')
  const [saving, setSaving] = useState(false)
  const [gpsStatus, setGpsStatus] = useState<string | null>(null)

  const reset = () => {
    setMethod('phone')
    setContent('')
    setGiftName('')
    setGiftQuantity('0')
    setGpsStatus(null)
  }

  const handleClose = () => { reset(); onClose() }

  const applyVoiceFields = (fields: TrackingVoiceFields) => {
    if (fields.method) setMethod(fields.method)
    if (fields.content) setContent(fields.content)
    if (fields.gift_name) setGiftName(fields.gift_name)
    if (fields.gift_quantity != null) setGiftQuantity(String(fields.gift_quantity))
  }

  const saveTracking = async (fields?: TrackingVoiceFields) => {
    const startedAt = perfNow()
    const nextContent = (fields?.content ?? content).trim()
    const nextMethod = fields?.method ?? method
    const nextGiftName = (fields?.gift_name ?? giftName).trim()
    const nextGiftQuantity = Math.max(1, fields?.gift_quantity ?? (parseInt(giftQuantity, 10) || 0))
    if (!nextContent) throw new Error('请输入跟踪内容')

    try {
      setSaving(true)
      const { data: { user } } = await trackPerf('customerDetail.tracking.add.getUser', () => supabase.auth.getUser())
      if (!user) { setSaving(false); throw new Error('登录已失效') }

      let locationId: string | null = null
      if (nextMethod === 'visit') {
        setGpsStatus('获取位置中...')
        const loc = await trackPerf('customerDetail.tracking.add.resolveLocation', () =>
          resolveVisitLocation(customerId),
        { customerId })
        if (loc) {
          locationId = loc.locationId
          setGpsStatus(loc.address ? `📍 ${loc.address}` : '📍 已记录位置')
        } else {
          setGpsStatus('⚠️ 无法获取位置')
        }
      }

      const { data: inserted, error } = await trackPerf('customerDetail.tracking.add.insertRecord', () =>
        supabase.from('tracking_records').insert({
          user_id: user.id,
          customer_id: customerId,
          method: nextMethod,
          content: nextContent,
          location_id: locationId,
          tracked_at: new Date().toISOString(),
        }).select('id').single(),
      { method: nextMethod, hasLocation: Boolean(locationId) })

      if (error) throw error
      if (nextGiftName && inserted) {
        const { error: giftError } = await trackPerf('customerDetail.tracking.add.insertGift', () =>
          supabase.from('tracking_gifts').insert({
            tracking_record_id: inserted.id,
            name: nextGiftName,
            quantity: nextGiftQuantity,
          }),
        { quantity: nextGiftQuantity })
        if (giftError) throw giftError
      }

      setSaving(false)
      reset()
      onSaved()
    } finally {
      perfLog('customerDetail.tracking.add.total', startedAt, { method: nextMethod, hasGift: Boolean(nextGiftName) })
    }
  }

  const handleSave = async () => {
    try {
      await saveTracking()
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
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
          <View className="mx-4 mt-4">
            <VoiceInputButton<TrackingVoiceFields>
              formType="tracking"
              title="语音新增跟踪"
              scriptLines={[
                '跟踪方式：电话 / 微信 / 邮件 / 上门拜访',
                '跟踪内容：今天沟通了产品方案，对方下周确认预算',
                '赠品：试用装，数量：2',
              ]}
              disabled={saving}
              submitMode="fill"
              onApply={applyVoiceFields}
              onSubmit={saveTracking}
            />
          </View>

          <View className="mx-4 mt-4 bg-white rounded-lg p-4">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">跟踪方式</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {METHODS.map(m => (
                  <TouchableOpacity
                    key={m.key}
                    onPress={() => setMethod(m.key)}
                    className={`px-3 py-2.5 rounded-lg border items-center min-w-[64px] ${
                      method === m.key ? 'bg-[#007AFF] border-[#007AFF]' : 'bg-white border-gray-200'
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
          <View className="mx-4 mt-4 bg-white rounded-lg p-4">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">赠品 / 试用装</Text>
            <TextInput
              className="text-base text-gray-900 border border-gray-100 rounded-lg px-3 py-2.5 mb-3"
              placeholder="赠品名称，例如试用装"
              placeholderTextColor="#9CA3AF"
              value={giftName}
              onChangeText={setGiftName}
            />
            <TextInput
              className="text-base text-gray-900 border border-gray-100 rounded-lg px-3 py-2.5"
              placeholder="数量"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={giftQuantity}
              onChangeText={setGiftQuantity}
            />
          </View>
          <View className="mx-4 mt-4 mb-8 bg-white rounded-lg p-4">
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
              autoFocus
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function AddSalesModal({
  visible, customerId, onClose, onSaved,
}: {
  visible: boolean; customerId: string; onClose: () => void; onSaved: () => void
}) {
  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const q = parseInt(quantity) || 0
    const p = parseFloat(unitPrice) || 0
    if (q > 0 && p > 0) setAmount((q * p).toFixed(2))
  }, [quantity, unitPrice])

  const reset = () => {
    setProductName(''); setQuantity('1'); setUnit(''); setUnitPrice(''); setAmount(''); setNotes('')
  }
  const handleClose = () => { reset(); onClose() }

  const applyVoiceFields = (fields: SalesVoiceFields) => {
    if (fields.product_name) setProductName(fields.product_name)
    if (fields.quantity != null) setQuantity(String(fields.quantity))
    if (fields.unit) setUnit(fields.unit)
    if (fields.unit_price != null) setUnitPrice(String(fields.unit_price))
    if (fields.amount != null) setAmount(String(fields.amount))
    if (fields.notes) setNotes(fields.notes)
  }

  const saveSales = async (fields?: SalesVoiceFields) => {
    const startedAt = perfNow()
    const nextProductName = (fields?.product_name ?? productName).trim()
    const nextQuantity = fields?.quantity ?? (parseInt(quantity) || 1)
    const nextUnit = (fields?.unit ?? unit).trim()
    const nextUnitPrice = fields?.unit_price ?? (unitPrice ? parseFloat(unitPrice) : null)
    const nextAmount = fields?.amount ?? (amount ? parseFloat(amount) : null)
    const nextNotes = (fields?.notes ?? notes).trim()

    if (!nextProductName) throw new Error('请输入产品名称')

    try {
      setSaving(true)
      const { data: { user } } = await trackPerf('customerDetail.sales.add.getUser', () => supabase.auth.getUser())
      if (!user) { setSaving(false); throw new Error('登录已失效') }

      const { error } = await trackPerf('customerDetail.sales.add.insert', () =>
        supabase.from('sales_records').insert({
          user_id: user.id,
          customer_id: customerId,
          product_name: nextProductName,
          quantity: nextQuantity,
          unit: nextUnit || null,
          unit_price: nextUnitPrice,
          amount: nextAmount,
          sale_date: new Date().toISOString().slice(0, 10),
          notes: nextNotes || null,
        }),
      { quantity: nextQuantity, unit: nextUnit || null, hasAmount: nextAmount != null })

      setSaving(false)
      if (error) throw error
      reset()
      onSaved()
    } finally {
      perfLog('customerDetail.sales.add.total', startedAt)
    }
  }

  const handleSave = async () => {
    try {
      await saveSales()
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
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
          <Text className="text-base font-semibold text-gray-800">新增销售</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#007AFF" />
              : <Text className="text-[#007AFF] text-base font-semibold">保存</Text>
            }
          </TouchableOpacity>
        </View>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="mx-4 mt-4">
            <VoiceInputButton<SalesVoiceFields>
              formType="sales"
              title="语音新增销售"
              scriptLines={[
                '产品：净水器滤芯，数量：2，单位：盒，单价：199',
                '备注：客户要求周五送货',
                '提示：金额可以不说，系统会根据数量和单价计算；说错了重新说，可以根据提示说慢了也没关系',
              ]}
              disabled={saving}
              submitMode="fill"
              onApply={applyVoiceFields}
              onSubmit={saveSales}
            />
          </View>

          <View className="mx-4 mt-4 bg-white rounded-lg overflow-hidden">
            <View className="px-4 pt-4 pb-2 border-b border-gray-50">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">产品名称 *</Text>
              <TextInput
                className="text-base text-gray-900 pb-2"
                placeholder="请输入产品或服务名称"
                placeholderTextColor="#9CA3AF"
                value={productName}
                onChangeText={setProductName}
                autoFocus
              />
            </View>
            <View className="flex-row border-b border-gray-50">
              <View className="flex-1 px-4 pt-4 pb-2 border-r border-gray-50">
                <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">数量</Text>
                <TextInput
                  className="text-base text-gray-900 pb-2"
                  placeholder="1"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                />
              </View>
              <View className="flex-1 px-4 pt-4 pb-2 border-r border-gray-50">
                <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">单位</Text>
                <TextInput
                  className="text-base text-gray-900 pb-2"
                  placeholder="盒、箱、个"
                  placeholderTextColor="#9CA3AF"
                  value={unit}
                  onChangeText={setUnit}
                />
              </View>
              <View className="flex-1 px-4 pt-4 pb-2">
                <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">单价（元）</Text>
                <TextInput
                  className="text-base text-gray-900 pb-2"
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  value={unitPrice}
                  onChangeText={setUnitPrice}
                />
              </View>
            </View>
            <View className="px-4 pt-4 pb-2">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">金额（元）</Text>
              <TextInput
                className="text-base text-gray-900 pb-2"
                placeholder="自动计算或手动填写"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
            </View>
          </View>
          <View className="mx-4 mt-4 mb-8 bg-white rounded-lg p-4">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">备注</Text>
            <TextInput
              className="text-base text-gray-900"
              placeholder="补充说明..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={notes}
              onChangeText={setNotes}
              style={{ minHeight: 72 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const resolvingLocationIdsRef = useRef<Set<string>>(new Set())

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerLocations, setCustomerLocations] = useState<CustomerLocation[]>([])
  const [trackingRecords, setTrackingRecords] = useState<TrackingRecord[]>([])
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddTracking, setShowAddTracking] = useState(false)
  const [showAddSales, setShowAddSales] = useState(false)
  const [activeTab, setActiveTab] = useState<'tracking' | 'sales' | 'trials'>('tracking')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [customerRes, locationsRes, trackingRes, salesRes] = await trackPerf('customerDetail.fetchAll', () =>
      Promise.all([
        supabase.from('customers').select('*').eq('id', id).single(),
        supabase.from('customer_locations')
          .select('*')
          .eq('customer_id', id)
          .order('created_at', { ascending: false }),
        supabase.from('tracking_records')
          .select('*, customer_locations(address, latitude, longitude), tracking_gifts(id, name, quantity, unit)')
          .eq('customer_id', id)
          .order('tracked_at', { ascending: false }),
        supabase.from('sales_records')
          .select('*')
          .eq('customer_id', id)
          .order('sale_date', { ascending: false }),
      ]),
    { customerId: id })

    if (customerRes.data) setCustomer(customerRes.data)
    if (locationsRes.data) setCustomerLocations(locationsRes.data)
    if (trackingRes.data) setTrackingRecords(trackingRes.data as unknown as TrackingRecord[])
    if (salesRes.data) setSalesRecords(salesRes.data)
    setLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => {
    fetchAll()
  }, [fetchAll]))

  useEffect(() => {
    const missingLocations = customerLocations.filter(loc =>
      !loc.address?.trim() && !resolvingLocationIdsRef.current.has(loc.id))

    if (missingLocations.length === 0) return

    let cancelled = false
    missingLocations.forEach((loc) => {
      resolvingLocationIdsRef.current.add(loc.id)
      void (async () => {
        const address = await resolveAddressForCoords(loc.latitude, loc.longitude)
        if (!address || cancelled) return

        setCustomerLocations(prev => prev.map(item =>
          item.id === loc.id ? { ...item, address } : item))
        setTrackingRecords(prev => prev.map(record =>
          record.location_id === loc.id && record.customer_locations
            ? { ...record, customer_locations: { ...record.customer_locations, address } }
            : record))

        await trackPerf('customerDetail.location.updateAddress', () =>
          supabase.from('customer_locations').update({ address }).eq('id', loc.id),
        { locationId: loc.id })
      })()
    })

    return () => { cancelled = true }
  }, [customerLocations])

  const handleDelete = () => {
    Alert.alert('删除客户', `确定要删除「${customer?.name}」吗？此操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          await supabase.from('customers').delete().eq('id', id)
          router.back()
        },
      },
    ])
  }

  const reclaimTrialItem = (item: TrialItem) => {
    Alert.alert('领回试用物料', `确认领回「${item.name}」x${Math.abs(item.quantity)}${item.unit ?? ''} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '领回',
        onPress: async () => {
          const startedAt = perfNow()
          try {
            const { data: { user } } = await trackPerf('customerDetail.trial.reclaim.getUser', () =>
              supabase.auth.getUser())
            if (!user) throw new Error('登录已失效')

            const { data: inserted, error } = await trackPerf('customerDetail.trial.reclaim.insertRecord', () =>
              supabase.from('tracking_records').insert({
                user_id: user.id,
                customer_id: id,
                method: 'other',
                content: `领回试用物料：${item.name}${item.unit ? `（${item.unit}）` : ''}`,
                tracked_at: new Date().toISOString(),
              }).select('id').single(),
            { itemName: item.name, unit: item.unit })

            if (error) throw error
            const { error: giftError } = await trackPerf('customerDetail.trial.reclaim.insertGift', () =>
              supabase.from('tracking_gifts').insert({
                tracking_record_id: inserted.id,
                name: item.name,
                quantity: -Math.abs(item.quantity),
                unit: item.unit,
              }),
            { quantity: -Math.abs(item.quantity), unit: item.unit })
            if (giftError) throw giftError
            fetchAll()
          } catch (error) {
            Alert.alert('领回失败', error instanceof Error ? error.message : '请稍后重试')
          } finally {
            perfLog('customerDetail.trial.reclaim.total', startedAt, { itemName: item.name, unit: item.unit })
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <View className="flex-1 bg-[#F2F2F7] items-center justify-center">
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  if (!customer) {
    return (
      <View className="flex-1 bg-[#F2F2F7] items-center justify-center">
        <Text className="text-gray-400">客户不存在</Text>
      </View>
    )
  }

  const typeStyle = TYPE_STYLE[customer.customer_type] ?? TYPE_STYLE['潜在伙伴']
  const avatarColor = AVATAR_COLORS[customer.name.charCodeAt(0) % AVATAR_COLORS.length]
  const totalSales = salesRecords.reduce((s, r) => s + (r.amount ?? 0), 0)
  const trialItems: TrialItem[] = trackingRecords.flatMap((rec) =>
    (rec.tracking_gifts ?? []).map((gift) => ({
      id: gift.id,
      trackingRecordId: rec.id,
      name: gift.name,
      quantity: gift.quantity,
      unit: gift.unit,
      notes: rec.content,
      trackedAt: rec.tracked_at,
    })),
  )
  const trialBalances = trialItems.reduce<Record<string, { name: string; unit: string | null; quantity: number }>>((acc, item) => {
    const key = `${item.name}__${item.unit ?? ''}`
    acc[key] = acc[key] ?? { name: item.name, unit: item.unit, quantity: 0 }
    acc[key].quantity += item.quantity
    return acc
  }, {})
  const trialBalanceList = Object.values(trialBalances)
  const trialRemainingById: Record<string, number> = {}
  Object.keys(trialBalances).forEach((key) => {
    const groupItems = trialItems.filter(item => `${item.name}__${item.unit ?? ''}` === key)
    let returnedQuantity = groupItems
      .filter(item => item.quantity < 0)
      .reduce((sum, item) => sum + Math.abs(item.quantity), 0)

    groupItems
      .filter(item => item.quantity > 0)
      .sort((a, b) => new Date(a.trackedAt).getTime() - new Date(b.trackedAt).getTime())
      .forEach((item) => {
        const consumed = Math.min(item.quantity, returnedQuantity)
        trialRemainingById[item.id] = item.quantity - consumed
        returnedQuantity -= consumed
      })
  })

  return (
    <View className="flex-1 bg-[#F2F2F7]">
      {/* 顶部导航 */}
      <View className="bg-white px-5 pt-14 pb-4 flex-row items-center justify-between border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="w-9 h-9 items-center justify-center">
          <Text className="text-2xl text-[#007AFF]">‹</Text>
        </TouchableOpacity>
        <Text className="text-base font-semibold text-gray-800">客户详情</Text>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={handleDelete}>
            <Text className="text-red-400 text-sm">删除</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* 基本信息卡 */}
        <View className="mx-4 mt-4 bg-white rounded-lg p-4">
          <View className="flex-row items-center mb-3">
            <View className={`w-14 h-14 rounded-full ${avatarColor} items-center justify-center mr-4`}>
              <Text className="text-white text-xl font-bold">{customer.name.slice(0, 1)}</Text>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-xl font-bold text-gray-900">{customer.name}</Text>
                <View className={`${typeStyle.bg} rounded-full px-2.5 py-0.5`}>
                  <Text className={`${typeStyle.text} text-xs font-medium`}>{customer.customer_type}</Text>
                </View>
                <TouchableOpacity
                  className="rounded-full bg-blue-50 px-2.5 py-0.5"
                  onPress={() => router.push(`/customers/${id}/edit`)}
                  activeOpacity={0.75}
                >
                  <Text className="text-[#007AFF] text-xs font-semibold">编辑</Text>
                </TouchableOpacity>
              </View>
              {customer.company ? (
                <Text className="text-gray-500 mt-0.5">{customer.company}</Text>
              ) : null}
            </View>
          </View>

          {customer.phone && (
            <View className="flex-row items-center py-2.5 border-t border-gray-50">
              <Text className="text-gray-400 text-sm w-14">手机</Text>
              <Text className="text-gray-700 text-sm">{customer.phone}</Text>
            </View>
          )}
          {customer.wechat && (
            <View className="flex-row items-center py-2.5 border-t border-gray-50">
              <Text className="text-gray-400 text-sm w-14">微信</Text>
              <Text className="text-gray-700 text-sm">{customer.wechat}</Text>
            </View>
          )}
          {customer.notes && (
            <View className="pt-2.5 border-t border-gray-50">
              <Text className="text-gray-400 text-sm mb-1">备注</Text>
              <Text className="text-gray-600 text-sm leading-5">{customer.notes}</Text>
            </View>
          )}
        </View>

        {/* 客户位置 */}
        <View className="mx-4 mt-3 bg-white rounded-lg overflow-hidden">
          <View className="px-4 py-3 border-b border-gray-50 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-gray-800">客户位置</Text>
            <Text className="text-xs text-gray-300">{customerLocations.length} 个地址</Text>
          </View>
          {customerLocations.length === 0 ? (
            <View className="px-4 py-4">
              <Text className="text-gray-400 text-sm">暂无位置记录，上门拜访时会自动记录</Text>
            </View>
          ) : (
            customerLocations.map((loc, index) => (
              <TouchableOpacity
                key={loc.id}
                className={`px-4 py-3.5 flex-row items-center ${index > 0 ? 'border-t border-gray-50' : ''}`}
                onPress={() => openNavigation(loc.latitude, loc.longitude, loc.address)}
                activeOpacity={0.75}
              >
                <View className="w-9 h-9 rounded-lg bg-blue-50 items-center justify-center mr-3">
                  <Text className="text-[#007AFF] text-base">⌖</Text>
                </View>
                <View className="flex-1 mr-3">
                  <Text className="text-gray-800 text-sm font-medium" numberOfLines={1}>
                    {loc.address?.trim() || '正在解析地址'}
                  </Text>
                  <Text className="text-gray-300 text-xs mt-0.5">
                    {loc.address?.trim() ? '点击打开导航' : '地址解析中，稍后自动更新'}
                  </Text>
                </View>
                <Text className="text-[#007AFF] text-sm font-semibold">导航</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* 统计栏 */}
        <View className="mx-4 mt-3 flex-row gap-3">
          <View className="flex-1 bg-white rounded-lg px-4 py-3 items-center">
            <Text className="text-[#007AFF] font-bold text-xl">{trackingRecords.length}</Text>
            <Text className="text-gray-400 text-xs mt-0.5">跟踪记录</Text>
          </View>
          <View className="flex-1 bg-white rounded-lg px-4 py-3 items-center">
            <Text className="text-green-600 font-bold text-xl">{salesRecords.length}</Text>
            <Text className="text-gray-400 text-xs mt-0.5">销售记录</Text>
          </View>
          {totalSales > 0 && (
            <View className="flex-1 bg-white rounded-lg px-4 py-3 items-center">
              <Text className="text-purple-600 font-bold text-base">
                ¥{totalSales >= 10000 ? `${(totalSales / 10000).toFixed(1)}万` : totalSales.toLocaleString()}
              </Text>
              <Text className="text-gray-400 text-xs mt-0.5">累计销售</Text>
            </View>
          )}
        </View>

        {/* 快捷操作 */}
        <View className="mx-4 mt-3 flex-row gap-3">
          <TouchableOpacity
            className="flex-1 bg-[#007AFF] rounded-lg py-3 items-center"
            onPress={() => { setActiveTab('tracking'); setShowAddTracking(true) }}
            activeOpacity={0.85}
          >
            <Text className="text-white text-sm font-semibold">+ 跟踪记录</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-green-500 rounded-lg py-3 items-center"
            onPress={() => { setActiveTab('sales'); setShowAddSales(true) }}
            activeOpacity={0.85}
          >
            <Text className="text-white text-sm font-semibold">+ 销售记录</Text>
          </TouchableOpacity>
        </View>
        <View className="mx-4 mt-3">
          <TouchableOpacity
            className="bg-amber-500 rounded-lg py-3 items-center"
            onPress={() => {
              setActiveTab('trials')
              router.push(`/customers/${id}/trial`)
            }}
            activeOpacity={0.85}
          >
            <Text className="text-white text-sm font-semibold">+ 新增试用</Text>
          </TouchableOpacity>
        </View>

        {/* Tab 切换 */}
        <View className="mx-4 mt-4">
          <View className="flex-row bg-gray-200 rounded-lg p-1">
            <TouchableOpacity
              onPress={() => setActiveTab('tracking')}
              className={`flex-1 py-2 rounded-lg items-center ${activeTab === 'tracking' ? 'bg-white' : ''}`}
            >
              <Text className={`text-sm font-medium ${activeTab === 'tracking' ? 'text-gray-800' : 'text-gray-400'}`}>
                跟踪记录 {trackingRecords.length > 0 ? `(${trackingRecords.length})` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('sales')}
              className={`flex-1 py-2 rounded-lg items-center ${activeTab === 'sales' ? 'bg-white' : ''}`}
            >
              <Text className={`text-sm font-medium ${activeTab === 'sales' ? 'text-gray-800' : 'text-gray-400'}`}>
                销售记录 {salesRecords.length > 0 ? `(${salesRecords.length})` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('trials')}
              className={`flex-1 py-2 rounded-lg items-center ${activeTab === 'trials' ? 'bg-white' : ''}`}
            >
              <Text className={`text-sm font-medium ${activeTab === 'trials' ? 'text-gray-800' : 'text-gray-400'}`}>
                试用清单 {trialItems.length > 0 ? `(${trialItems.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 跟踪记录列表 */}
        {activeTab === 'tracking' && (
          <View className="mx-4 mt-3 bg-white rounded-lg overflow-hidden">
            {trackingRecords.length === 0 ? (
              <View className="py-10 items-center">
                <Text className="text-gray-300 text-4xl mb-3">📋</Text>
                <Text className="text-gray-400 text-sm">暂无跟踪记录</Text>
              </View>
            ) : (
              trackingRecords.map((rec, i) => {
                const m = METHOD_MAP[rec.method]
                const locationLabel = rec.customer_locations ? formatLocationLabel(rec.customer_locations) : ''
                return (
                  <View key={rec.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    <View className="flex-row items-center justify-between mb-1.5">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-base">{m?.emoji ?? '📝'}</Text>
                        <Text className="text-sm font-medium text-gray-600">{m?.label ?? rec.method}</Text>
                      </View>
                      <Text className="text-xs text-gray-300">{formatDate(rec.tracked_at)}</Text>
                    </View>
                    <Text className="text-gray-700 text-sm leading-5">{rec.content}</Text>
                    {rec.customer_locations && rec.method === 'visit' && (
                      <View className="mt-2 flex-row items-center">
                        <Text className="text-gray-300 text-xs flex-1 mr-2" numberOfLines={1}>
                          📍 {locationLabel}
                        </Text>
                        <TouchableOpacity
                          className="px-2.5 py-1 rounded-full bg-blue-50"
                          onPress={() => openNavigation(
                            rec.customer_locations!.latitude,
                            rec.customer_locations!.longitude,
                            rec.customer_locations!.address,
                          )}
                          activeOpacity={0.75}
                        >
                          <Text className="text-[#007AFF] text-xs font-semibold">导航</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {rec.tracking_gifts?.length ? (
                      <View className="mt-2 rounded-lg bg-amber-50 px-3 py-2">
                        <Text className="text-amber-700 text-xs">
                          赠品：{rec.tracking_gifts.map(gift => `${gift.name} x${gift.quantity}${gift.unit ?? ''}`).join('，')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )
              })
            )}
          </View>
        )}

        {/* 销售记录列表 */}
        {activeTab === 'sales' && (
          <View className="mx-4 mt-3 bg-white rounded-lg overflow-hidden">
            {salesRecords.length === 0 ? (
              <View className="py-10 items-center">
                <Text className="text-gray-300 text-4xl mb-3">💰</Text>
                <Text className="text-gray-400 text-sm">暂无销售记录</Text>
              </View>
            ) : (
              salesRecords.map((rec, i) => (
                <View key={rec.id} className={`px-4 py-3.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                  <View className="flex-row items-start justify-between mb-2">
                    <Text className="text-gray-800 font-semibold text-sm flex-1 mr-3" numberOfLines={2}>
                      {rec.product_name}
                    </Text>
                    <Text className="text-green-600 font-bold text-sm">
                      合计：¥{(rec.amount ?? ((rec.unit_price ?? 0) * rec.quantity)).toLocaleString('zh-CN')}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                    <Text className="text-gray-400 text-xs">数量：{rec.quantity}{rec.unit ?? ''}</Text>
                    <Text className="text-gray-400 text-xs">
                      价格：{rec.unit_price != null ? `¥${rec.unit_price}` : '未填写'}
                    </Text>
                    <Text className="text-gray-400 text-xs">日期：{formatDate(rec.sale_date)}</Text>
                  </View>
                  {rec.notes && (
                    <Text className="text-gray-400 text-xs mt-1.5">{rec.notes}</Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* 试用清单 */}
        {activeTab === 'trials' && (
          <View className="mx-4 mt-3 bg-white rounded-lg overflow-hidden">
            {trialItems.length === 0 ? (
              <View className="py-10 items-center">
                <Text className="text-gray-300 text-4xl mb-3">📦</Text>
                <Text className="text-gray-400 text-sm">暂无试用产品和物料</Text>
              </View>
            ) : (
              <>
                <View className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                  <Text className="text-amber-700 text-xs font-semibold mb-1.5">当前试用结余</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {trialBalanceList.map(balance => (
                      <View key={`${balance.name}-${balance.unit ?? ''}`} className="bg-white rounded-full px-2.5 py-1">
                        <Text className="text-amber-700 text-xs">
                          {balance.name}：{balance.quantity}{balance.unit ?? ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                {trialItems.map((item, index) => {
                  const remainingQuantity = trialRemainingById[item.id] ?? 0
                  const canReclaim = item.quantity > 0 && remainingQuantity > 0

                  return (
                    <View key={item.id} className={`px-4 py-3.5 ${index > 0 ? 'border-t border-gray-50' : ''}`}>
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 mr-3">
                          <Text className="text-gray-800 font-semibold text-sm">{item.name}</Text>
                          <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-1">
                            <Text className="text-gray-400 text-xs">
                              数量：{item.quantity > 0 ? `+${item.quantity}` : item.quantity}{item.unit ?? ''}
                            </Text>
                            <Text className="text-gray-400 text-xs">日期：{formatDate(item.trackedAt)}</Text>
                          </View>
                          <Text className="text-gray-400 text-xs mt-1" numberOfLines={2}>
                            备注：{item.notes || '无'}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className={`font-bold text-sm ${item.quantity > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {item.quantity > 0 ? '发出' : '领回'}
                          </Text>
                          {canReclaim ? (
                            <TouchableOpacity
                              className="mt-2 px-3 py-1.5 rounded-full bg-[#007AFF]"
                              onPress={() => reclaimTrialItem({ ...item, quantity: remainingQuantity })}
                              activeOpacity={0.8}
                            >
                              <Text className="text-white text-xs font-semibold">领回</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text className="text-gray-300 text-xs mt-2">
                              {item.quantity > 0 ? '已领回' : '已冲抵'}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  )
                })}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <AddTrackingModal
        visible={showAddTracking}
        customerId={id}
        onClose={() => setShowAddTracking(false)}
        onSaved={() => {
          setShowAddTracking(false)
          fetchAll()
        }}
      />
      <AddSalesModal
        visible={showAddSales}
        customerId={id}
        onClose={() => setShowAddSales(false)}
        onSaved={() => {
          setShowAddSales(false)
          fetchAll()
        }}
      />
    </View>
  )
}
