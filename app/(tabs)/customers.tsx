import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  Modal, KeyboardAvoidingView, Platform, Alert,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { VoiceInputButton } from '../../components/VoiceInputButton'
import type { Customer, CustomerType } from '../../types/database'

const CUSTOMER_TYPES: CustomerType[] = ['潜在伙伴', '客户', '伙伴']

const TYPE_STYLE: Record<CustomerType, { bg: string; text: string }> = {
  '潜在伙伴': { bg: 'bg-gray-100', text: 'text-gray-500' },
  '客户':     { bg: 'bg-blue-50', text: 'text-[#007AFF]' },
  '伙伴':     { bg: 'bg-green-50', text: 'text-green-600' },
}

type CustomerVoiceFields = {
  name?: string | null
  company?: string | null
  phone?: string | null
  wechat?: string | null
  customer_type?: CustomerType | null
  notes?: string | null
}

function AddCustomerModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [wechat, setWechat] = useState('')
  const [notes, setNotes] = useState('')
  const [customerType, setCustomerType] = useState<CustomerType>('潜在伙伴')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setName('')
    setCompany('')
    setPhone('')
    setWechat('')
    setNotes('')
    setCustomerType('潜在伙伴')
  }

  const handleClose = () => { reset(); onClose() }

  const applyVoiceFields = (fields: CustomerVoiceFields) => {
    if (fields.name) setName(fields.name)
    if (fields.company) setCompany(fields.company)
    if (fields.phone) setPhone(fields.phone)
    if (fields.wechat) setWechat(fields.wechat)
    if (fields.notes) setNotes(fields.notes)
    if (fields.customer_type && CUSTOMER_TYPES.includes(fields.customer_type)) {
      setCustomerType(fields.customer_type)
    }
  }

  const saveCustomer = async (fields?: CustomerVoiceFields) => {
    const nextName = (fields?.name ?? name).trim()
    if (!nextName) throw new Error('请输入客户姓名')

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); throw new Error('登录已失效') }

    const nextType = fields?.customer_type && CUSTOMER_TYPES.includes(fields.customer_type)
      ? fields.customer_type
      : customerType

    const { error } = await supabase.from('customers').insert({
      user_id: user.id,
      name: nextName,
      company: (fields?.company ?? company).trim() || null,
      phone: (fields?.phone ?? phone).trim() || null,
      wechat: (fields?.wechat ?? wechat).trim() || null,
      notes: (fields?.notes ?? notes).trim() || null,
      tags: [],
      customer_type: nextType,
    })

    setSaving(false)
    if (error) throw error
    reset()
    onSaved()
  }

  const handleSave = async () => {
    try {
      await saveCustomer()
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
          <Text className="text-base font-semibold text-gray-800">新增客户</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#007AFF" />
              : <Text className="text-[#007AFF] text-base font-semibold">保存</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="mx-4 mt-4">
            <VoiceInputButton<CustomerVoiceFields>
              formType="customer"
              title="语音新增客户"
              scriptLines={[
                '客户姓名：张三',
                '公司：某某科技，手机号：13800000000，微信：zhangsan',
                '客户类型：潜在伙伴 / 客户 / 伙伴，备注：需要重点跟进',
              ]}
              disabled={saving}
              onApply={applyVoiceFields}
              onSubmit={saveCustomer}
            />
          </View>

          <View className="mx-4 mt-4 bg-white rounded-lg overflow-hidden">
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
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">微信号</Text>
              <TextInput
                className="text-base text-gray-900 pb-2"
                placeholder="请输入微信号"
                placeholderTextColor="#9CA3AF"
                value={wechat}
                onChangeText={setWechat}
              />
            </View>
          </View>

          <View className="mx-4 mt-4 bg-white rounded-lg overflow-hidden">
            <View className="px-4 pt-4 pb-3">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">客户类型</Text>
              <View className="flex-row gap-2">
                {CUSTOMER_TYPES.map(type => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setCustomerType(type)}
                    className={`flex-1 py-2 rounded-lg border items-center ${
                      customerType === type
                        ? 'bg-[#007AFF] border-[#007AFF]'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${
                      customerType === type ? 'text-white' : 'text-gray-600'
                    }`}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View className="mx-4 mt-4 mb-8 bg-white rounded-lg overflow-hidden">
            <View className="px-4 pt-4 pb-2">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">备注</Text>
              <TextInput
                className="text-base text-gray-900 pb-2"
                placeholder="备注信息"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={notes}
                onChangeText={setNotes}
                style={{ minHeight: 72 }}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const AVATAR_COLORS = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500']

function CustomerCard({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const initials = customer.name.slice(0, 1)
  const colorClass = AVATAR_COLORS[customer.name.charCodeAt(0) % AVATAR_COLORS.length]
  const typeStyle = TYPE_STYLE[customer.customer_type] ?? TYPE_STYLE['潜在伙伴']

  return (
    <TouchableOpacity
      className="bg-white rounded-lg px-4 py-3.5 mb-3 flex-row items-center"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View className={`w-11 h-11 rounded-full ${colorClass} items-center justify-center mr-3`}>
        <Text className="text-white text-base font-bold">{initials}</Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-gray-800 font-semibold text-base">{customer.name}</Text>
          <View className={`${typeStyle.bg} rounded-full px-2 py-0.5`}>
            <Text className={`${typeStyle.text} text-xs font-medium`}>{customer.customer_type}</Text>
          </View>
        </View>
        {customer.company ? (
          <Text className="text-gray-400 text-sm mt-0.5">{customer.company}</Text>
        ) : null}
        {customer.phone ? (
          <Text className="text-gray-400 text-xs mt-0.5">{customer.phone}</Text>
        ) : null}
      </View>
      <Text className="text-gray-300 text-xl">›</Text>
    </TouchableOpacity>
  )
}

export default function CustomersScreen() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) setCustomers(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const filtered = query.trim()
    ? customers.filter(c =>
        c.name.includes(query) ||
        (c.company ?? '').includes(query) ||
        (c.phone ?? '').includes(query)
      )
    : customers

  return (
    <View className="flex-1 bg-[#F2F2F7]">
      <View className="bg-white px-5 pt-14 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-3xl font-bold text-gray-900">客户</Text>
          <TouchableOpacity
            className="bg-[#007AFF] w-9 h-9 rounded-full items-center justify-center"
            onPress={() => setShowAdd(true)}
          >
            <Text className="text-white text-2xl leading-none mt-[-1]">+</Text>
          </TouchableOpacity>
        </View>
        <View className="bg-gray-100 rounded-lg flex-row items-center px-3 py-2.5">
          <Text className="text-gray-400 mr-2">🔍</Text>
          <TextInput
            className="flex-1 text-base text-gray-800"
            placeholder="搜索姓名、公司、手机号"
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text className="text-gray-400 text-lg">✕</Text>
            </TouchableOpacity>
          )}
        </View>
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
          renderItem={({ item }) => (
            <CustomerCard
              customer={item}
              onPress={() => router.push(`/customers/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20">
              <Text className="text-5xl mb-4">👥</Text>
              <Text className="text-gray-400 text-base">
                {query ? '没有匹配的客户' : '还没有客户，点击 + 添加'}
              </Text>
            </View>
          }
        />
      )}

      <AddCustomerModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => {
          setShowAdd(false)
          fetchCustomers()
        }}
      />
    </View>
  )
}
