import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { trackPerf } from '../../lib/perf'
import type { Task, TaskStatus } from '../../types/database'

type TaskWithCustomer = Task & {
  customers: { id: string; name: string; company: string | null } | null
}

const STATUS_META: Record<TaskStatus, { label: string; color: string; background: string }> = {
  pending: { label: '待办', color: 'text-[#007AFF]', background: 'bg-blue-50' },
  postponed: { label: '已推迟', color: 'text-amber-600', background: 'bg-amber-50' },
  done: { label: '已完成', color: 'text-green-600', background: 'bg-green-50' },
}

function formatDateTime(iso: string | null) {
  if (!iso) return '未设置提醒'
  const date = new Date(iso)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [task, setTask] = useState<TaskWithCustomer | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const fetchTask = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error } = await trackPerf('taskDetail.fetch', () =>
      supabase
        .from('tasks')
        .select('*, customers(id, name, company)')
        .eq('id', id)
        .maybeSingle(),
    { id })

    if (error) Alert.alert('加载失败', error.message)
    setTask(data as TaskWithCustomer | null)
    setLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => {
    void fetchTask()
  }, [fetchTask]))

  const updateStatus = async (status: TaskStatus) => {
    if (!task) return
    try {
      setUpdating(true)
      const { error } = await trackPerf('taskDetail.updateStatus', () =>
        supabase.from('tasks').update({ status }).eq('id', task.id),
      { status })
      if (error) throw error
      setTask(current => current ? { ...current, status } : current)
    } catch (error) {
      Alert.alert('更新失败', error instanceof Error ? error.message : '请稍后重试')
    } finally {
      setUpdating(false)
    }
  }

  const deleteTask = async () => {
    if (!task) return
    try {
      setUpdating(true)
      const { error } = await trackPerf('taskDetail.delete', () =>
        supabase.from('tasks').delete().eq('id', task.id),
      { id: task.id })
      if (error) throw error
      router.back()
    } catch (error) {
      Alert.alert('删除失败', error instanceof Error ? error.message : '请稍后重试')
    } finally {
      setUpdating(false)
    }
  }

  const confirmDelete = () => {
    Alert.alert('删除任务', '删除后无法恢复，是否继续？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void deleteTask() },
    ])
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  if (!task) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6">
        <Text className="text-gray-800 text-lg font-semibold">任务不存在或已被删除</Text>
        <TouchableOpacity className="mt-5 bg-[#007AFF] rounded-lg px-5 py-3" onPress={() => router.back()}>
          <Text className="text-white font-semibold">返回任务列表</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const statusMeta = STATUS_META[task.status]

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-row items-center justify-between px-5 pt-14 pb-4 bg-brand-600 border-b border-brand-500">
        <TouchableOpacity className="py-1 pr-3" onPress={() => router.back()}>
          <Text className="text-white text-base font-medium">‹ 任务</Text>
        </TouchableOpacity>
        <Text className="text-[20px] font-semibold text-white">任务详情</Text>
        <View className="w-12" />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>
        <View className="bg-white rounded-2xl p-5 border border-line shadow-card">
          <View className={`self-start rounded-full px-3 py-1 ${statusMeta.background}`}>
            <Text className={`text-xs font-semibold ${statusMeta.color}`}>{statusMeta.label}</Text>
          </View>
          <Text className="text-xl font-bold text-gray-900 mt-3 leading-7">{task.title}</Text>
        </View>

        <View className="bg-white rounded-2xl mt-4 overflow-hidden border border-line shadow-card">
          <View className="px-4 py-4 border-b border-gray-50">
            <Text className="text-gray-400 text-xs mb-1">提醒时间</Text>
            <Text className="text-gray-900 text-base">{formatDateTime(task.remind_at)}</Text>
          </View>
          <View className="px-4 py-4">
            <Text className="text-gray-400 text-xs mb-1">创建时间</Text>
            <Text className="text-gray-900 text-base">{formatDateTime(task.created_at)}</Text>
          </View>
        </View>

        {task.customers ? (
          <TouchableOpacity
            className="bg-white rounded-2xl mt-4 px-4 py-4 flex-row items-center border border-line shadow-card"
            onPress={() => router.push(`/customers/${task.customers?.id}`)}
            activeOpacity={0.75}
          >
            <View className="w-10 h-10 rounded-full bg-blue-50 items-center justify-center mr-3">
              <Text className="text-[#007AFF] text-base">客</Text>
            </View>
            <View className="flex-1">
              <Text className="text-gray-400 text-xs mb-0.5">关联客户</Text>
              <Text className="text-gray-900 text-base font-medium">{task.customers.name}{task.customers.company ? ` · ${task.customers.company}` : ''}</Text>
            </View>
            <Text className="text-gray-300 text-xl">›</Text>
          </TouchableOpacity>
        ) : null}

        <View className="bg-white rounded-2xl mt-4 px-4 py-4 border border-line shadow-card">
          <Text className="text-gray-400 text-xs mb-2">备注</Text>
          <Text className="text-gray-800 text-base leading-6">{task.notes || '暂无备注'}</Text>
        </View>

        <View className="mt-6 gap-3">
          {task.status !== 'done' ? (
            <TouchableOpacity
              className="bg-[#34C759] rounded-lg py-3.5 items-center"
              onPress={() => void updateStatus('done')}
              disabled={updating}
            >
              {updating ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-base font-semibold">标记为完成</Text>}
            </TouchableOpacity>
          ) : null}
          {task.status === 'pending' ? (
            <TouchableOpacity
              className="bg-white border border-amber-200 rounded-lg py-3.5 items-center"
              onPress={() => void updateStatus('postponed')}
              disabled={updating}
            >
              <Text className="text-amber-600 text-base font-semibold">推迟任务</Text>
            </TouchableOpacity>
          ) : null}
          {task.status !== 'pending' ? (
            <TouchableOpacity
              className="bg-white border border-gray-200 rounded-lg py-3.5 items-center"
              onPress={() => void updateStatus('pending')}
              disabled={updating}
            >
              <Text className="text-gray-700 text-base font-semibold">恢复为待办</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            className="bg-white border border-red-200 rounded-lg py-3.5 items-center"
            onPress={confirmDelete}
            disabled={updating}
          >
            <Text className="text-red-500 text-base font-semibold">删除任务</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}
