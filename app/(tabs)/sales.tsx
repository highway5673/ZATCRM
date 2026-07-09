import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, TextInput,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { perfLog, perfNow, trackPerf } from '../../lib/perf'
import { VoiceInputButton } from '../../components/VoiceInputButton'
import type { SalesRecord } from '../../types/database'

type CustomerOption = { id: string; name: string; company: string | null }

type SalesVoiceFields = {
  customer_name?: string | null
  product_name?: string | null
  quantity?: number | null
  unit_price?: number | null
  amount?: number | null
  notes?: string | null
}

type SalesWithCustomer = SalesRecord & {
  customers: { name: string; company: string | null } | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function AddSalesModal({
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
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setCustomerId(defaultCustomerId ?? '')
      trackPerf('sales.add.loadCustomers', () =>
        supabase.from('customers').select('id, name, company').order('name')).then(({ data }) => {
        if (data) setCustomers(data)
      })
    }
  }, [visible, defaultCustomerId])

  useEffect(() => {
    const q = parseInt(quantity) || 0
    const p = parseFloat(unitPrice) || 0
    if (q > 0 && p > 0) {
      setAmount((q * p).toFixed(2))
    }
  }, [quantity, unitPrice])

  const reset = () => {
    setCustomerId(defaultCustomerId ?? '')
    setProductName('')
    setQuantity('1')
    setUnitPrice('')
    setAmount('')
    setNotes('')
  }

  const handleClose = () => { reset(); onClose() }

  const findCustomerId = (name?: string | null) => {
    if (!name) return ''
    const text = name.trim()
    const matched = customers.find(c =>
      c.name === text ||
      c.name.includes(text) ||
      text.includes(c.name) ||
      (c.company ? text.includes(c.company) : false)
    )
    return matched?.id ?? ''
  }

  const applyVoiceFields = (fields: SalesVoiceFields) => {
    if (fields.product_name) setProductName(fields.product_name)
    if (fields.quantity != null) setQuantity(String(fields.quantity))
    if (fields.unit_price != null) setUnitPrice(String(fields.unit_price))
    if (fields.amount != null) setAmount(String(fields.amount))
    if (fields.notes) setNotes(fields.notes)
    if (!defaultCustomerId && fields.customer_name) {
      const matchedId = findCustomerId(fields.customer_name)
      if (matchedId) setCustomerId(matchedId)
    }
  }

  const saveSales = async (fields?: SalesVoiceFields) => {
    const startedAt = perfNow()
    const nextCustomerId = defaultCustomerId || customerId || findCustomerId(fields?.customer_name)
    const nextProductName = (fields?.product_name ?? productName).trim()
    const nextQuantity = fields?.quantity ?? (parseInt(quantity) || 1)
    const nextUnitPrice = fields?.unit_price ?? (unitPrice ? parseFloat(unitPrice) : null)
    const nextAmount = fields?.amount ?? (amount ? parseFloat(amount) : null)
    const nextNotes = (fields?.notes ?? notes).trim()

    if (!nextCustomerId) throw new Error('请选择客户')
    if (!nextProductName) throw new Error('请输入产品名称')

    try {
      setSaving(true)
      const { data: { user } } = await trackPerf('sales.add.getUser', () => supabase.auth.getUser())
      if (!user) { setSaving(false); throw new Error('登录已失效') }

      const { error } = await trackPerf('sales.add.insert', () =>
        supabase.from('sales_records').insert({
          user_id: user.id,
          customer_id: nextCustomerId,
          product_name: nextProductName,
          quantity: nextQuantity,
          unit_price: nextUnitPrice,
          amount: nextAmount,
          sale_date: new Date().toISOString().slice(0, 10),
          notes: nextNotes || null,
        }),
      { quantity: nextQuantity, hasAmount: nextAmount != null })

      setSaving(false)
      if (error) throw error
      reset()
      onSaved()
    } finally {
      perfLog('sales.add.total', startedAt)
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
                defaultCustomerId ? '产品：净水器滤芯，数量：2，单价：199' : '客户：张三，产品：净水器滤芯，数量：2，单价：199',
                '金额：398',
                '备注：客户要求周五送货',
                '提示：金额可以不说，系统会根据数量和单价计算；说错了重新说，可以根据提示说慢了也没关系',
              ]}
              disabled={saving}
              onApply={applyVoiceFields}
              onSubmit={saveSales}
            />
          </View>

          {/* 关联客户 */}
          {!defaultCustomerId && (
            <View className="mx-4 mt-4 bg-white rounded-lg p-4">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">关联客户 *</Text>
              {customers.length === 0 ? (
                <Text className="text-gray-400 text-sm">请先添加客户</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {customers.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setCustomerId(c.id)}
                        className={`px-3 py-2 rounded-lg border ${
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

          {/* 产品信息 */}
          <View className="mx-4 mt-4 bg-white rounded-lg overflow-hidden">
            <View className="px-4 pt-4 pb-2 border-b border-gray-50">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">产品名称 *</Text>
              <TextInput
                className="text-base text-gray-900 pb-2"
                placeholder="请输入产品或服务名称"
                placeholderTextColor="#9CA3AF"
                value={productName}
                onChangeText={setProductName}
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

          {/* 备注 */}
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

function SalesCard({ item }: { item: SalesWithCustomer }) {
  return (
    <View className="bg-white rounded-lg p-4 mb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <Text className="text-gray-800 font-semibold text-base">{item.product_name}</Text>
          <Text className="text-gray-400 text-sm mt-0.5">
            {item.customers?.name ?? '—'}
            {item.customers?.company ? ` · ${item.customers.company}` : ''}
          </Text>
        </View>
        {item.amount != null && (
          <Text className="text-green-600 font-bold text-base">
            ¥{item.amount.toLocaleString('zh-CN')}
          </Text>
        )}
      </View>
      <View className="flex-row items-center gap-4 mt-2">
        <Text className="text-gray-400 text-xs">数量：{item.quantity}</Text>
        {item.unit_price != null && (
          <Text className="text-gray-400 text-xs">单价：¥{item.unit_price}</Text>
        )}
        <Text className="text-gray-300 text-xs">{formatDate(item.sale_date)}</Text>
      </View>
      {item.notes && (
        <Text className="text-gray-400 text-xs mt-1.5">{item.notes}</Text>
      )}
    </View>
  )
}

export default function SalesScreen() {
  const [records, setRecords] = useState<SalesWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await trackPerf('sales.fetchList', () =>
      supabase
        .from('sales_records')
        .select('*, customers(name, company)')
        .order('sale_date', { ascending: false })
        .limit(200))

    if (!error && data) setRecords(data as unknown as SalesWithCustomer[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const totalAmount = records.reduce((s, r) => s + (r.amount ?? 0), 0)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthRecords = records.filter(r => r.sale_date >= monthStart)
  const monthAmount = monthRecords.reduce((s, r) => s + (r.amount ?? 0), 0)

  return (
    <View className="flex-1 bg-[#F2F2F7]">
      <View className="bg-white px-5 pt-14 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-3xl font-bold text-gray-900">销售</Text>
          <TouchableOpacity
            className="bg-[#007AFF] w-9 h-9 rounded-full items-center justify-center"
            onPress={() => setShowAdd(true)}
          >
            <Text className="text-white text-2xl leading-none mt-[-1]">+</Text>
          </TouchableOpacity>
        </View>

        {records.length > 0 && (
          <View className="flex-row gap-3">
            <View className="flex-1 bg-green-50 rounded-lg px-4 py-3">
              <Text className="text-xs text-green-600 font-semibold">本月销售</Text>
              <Text className="text-green-700 font-bold text-lg mt-1">
                ¥{monthAmount.toLocaleString('zh-CN')}
              </Text>
              <Text className="text-green-400 text-xs">{monthRecords.length} 笔</Text>
            </View>
            <View className="flex-1 bg-blue-50 rounded-lg px-4 py-3">
              <Text className="text-xs text-[#007AFF] font-semibold">累计销售</Text>
              <Text className="text-[#007AFF] font-bold text-lg mt-1">
                ¥{totalAmount.toLocaleString('zh-CN')}
              </Text>
              <Text className="text-blue-300 text-xs">{records.length} 笔</Text>
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => <SalesCard item={item} />}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20">
              <Text className="text-5xl mb-4">💰</Text>
              <Text className="text-gray-400 text-base">暂无销售记录，点击 + 添加</Text>
            </View>
          }
        />
      )}

      <AddSalesModal
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
