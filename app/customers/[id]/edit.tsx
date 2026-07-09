import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import type { Customer, CustomerType } from '../../../types/database'

const CUSTOMER_TYPES: CustomerType[] = ['潜在伙伴', '客户', '伙伴']

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
      <View className="flex-1 bg-[#F2F2F7] items-center justify-center">
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#F2F2F7]"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="bg-white px-5 pt-14 pb-4 flex-row items-center justify-between border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="w-12">
          <Text className="text-[#007AFF] text-base">取消</Text>
        </TouchableOpacity>
        <Text className="text-base font-semibold text-gray-800">编辑客户</Text>
        <TouchableOpacity onPress={save} disabled={saving} className="w-12 items-end">
          {saving
            ? <ActivityIndicator size="small" color="#007AFF" />
            : <Text className="text-[#007AFF] text-base font-semibold">保存</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 36 }}>
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

        <View className="mx-4 mt-4 bg-white rounded-lg p-4">
          <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">客户类型</Text>
          <View className="flex-row gap-2">
            {CUSTOMER_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                onPress={() => setCustomerType(type)}
                className={`flex-1 py-2 rounded-lg border items-center ${
                  customerType === type ? 'bg-[#007AFF] border-[#007AFF]' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm font-medium ${customerType === type ? 'text-white' : 'text-gray-600'}`}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="mx-4 mt-4 bg-white rounded-lg p-4">
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
