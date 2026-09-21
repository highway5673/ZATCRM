import { useState } from 'react'
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
import { perfLog, perfNow, trackPerf } from '../../../lib/perf'
import { supabase } from '../../../lib/supabase'
import { AppHeader } from '../../../components/ui/AppHeader'

export default function AddTrialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const startedAt = perfNow()
    const nextName = name.trim()
    const parsedQuantity = Math.abs(parseInt(quantity, 10) || 0)
    const nextUnit = unit.trim()
    const nextNotes = notes.trim()

    if (!nextName) {
      Alert.alert('保存失败', '请输入试用品名称')
      return
    }

    if (parsedQuantity < 1) {
      Alert.alert('保存失败', '请输入有效数量')
      return
    }

    try {
      setSaving(true)
      const { data: { user } } = await trackPerf('customerDetail.trial.add.getUser', () =>
        supabase.auth.getUser())
      if (!user) throw new Error('登录已失效')

      const content = nextNotes || `新增试用：${nextName}`

      const { data: inserted, error } = await trackPerf('customerDetail.trial.add.insertRecord', () =>
        supabase.from('tracking_records').insert({
          user_id: user.id,
          customer_id: id,
          method: 'other',
          content,
          tracked_at: new Date().toISOString(),
        }).select('id').single(),
      { customerId: id })

      if (error) throw error

      const { error: giftError } = await trackPerf('customerDetail.trial.add.insertGift', () =>
        supabase.from('tracking_gifts').insert({
          tracking_record_id: inserted.id,
          name: nextName,
          quantity: parsedQuantity,
          unit: nextUnit || null,
        }),
      { quantity: parsedQuantity, unit: nextUnit || null })

      if (giftError) throw giftError
      router.back()
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后重试')
    } finally {
      setSaving(false)
      perfLog('customerDetail.trial.add.total', startedAt)
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AppHeader
        title="新增试用"
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
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">试用品名称 *</Text>
            <TextInput
              className="text-base text-gray-900 pb-2"
              placeholder="例如精华浴足液、木桶"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          <View className="px-4 pt-4 pb-4">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">数量 *</Text>
            <TextInput
              className="text-base text-gray-900 border border-gray-100 rounded-lg px-3 py-2.5"
              placeholder="1"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
            />
          </View>

          <View className="px-4 pt-4 pb-4 border-t border-gray-50">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">单位</Text>
            <TextInput
              className="text-base text-gray-900 border border-gray-100 rounded-lg px-3 py-2.5"
              placeholder="个、箱、盒"
              placeholderTextColor="#9CA3AF"
              value={unit}
              onChangeText={setUnit}
            />
          </View>
        </View>

        <View className="mx-4 mt-4 rounded-2xl border border-line bg-white p-4 shadow-card">
          <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">备注</Text>
          <TextInput
            className="text-base text-gray-900"
            placeholder="记录试用说明或后续处理"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
            style={{ minHeight: 120 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
