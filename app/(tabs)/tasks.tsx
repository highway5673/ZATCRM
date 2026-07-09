import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, TextInput,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import type { Task, TaskStatus } from '../../types/database'

type CustomerOption = { id: string; name: string }

function AddTaskModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      supabase.from('customers').select('id, name').order('name').then(({ data }) => {
        if (data) setCustomers(data)
      })
    }
  }, [visible])

  const reset = () => { setTitle(''); setNotes(''); setCustomerId('') }
  const handleClose = () => { reset(); onClose() }

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('提示', '请输入任务标题'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title: title.trim(),
      notes: notes.trim() || null,
      customer_id: customerId || null,
      status: 'pending' as TaskStatus,
    })

    setSaving(false)
    if (error) { Alert.alert('保存失败', error.message) }
    else { reset(); onSaved() }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        className="flex-1 bg-white"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <TouchableOpacity onPress={handleClose}>
            <Text className="text-gray-500 text-base">取消</Text>
          </TouchableOpacity>
          <Text className="text-base font-semibold text-gray-800">新增任务</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#2563EB" />
              : <Text className="text-primary-600 text-base font-semibold">保存</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-gray-500 mb-1">任务标题 *</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base"
            placeholder="例：给张三发送报价单"
            value={title}
            onChangeText={setTitle}
            autoFocus
          />

          <Text className="text-sm text-gray-500 mb-2">关联客户（可选）</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setCustomerId('')}
                className={`px-3 py-2 rounded-xl border ${
                  !customerId ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm ${!customerId ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                  无
                </Text>
              </TouchableOpacity>
              {customers.map(c => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setCustomerId(c.id)}
                  className={`px-3 py-2 rounded-xl border ${
                    customerId === c.id
                      ? 'bg-primary-600 border-primary-600'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <Text className={`text-sm ${customerId === c.id ? 'text-white font-medium' : 'text-gray-700'}`}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text className="text-sm text-gray-500 mb-1">备注</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 mb-8 text-base"
            placeholder="补充说明..."
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
            style={{ minHeight: 80 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

type TaskWithCustomer = Task & { customers: { name: string } | null }

function TaskItem({
  task,
  onStatusChange,
}: {
  task: TaskWithCustomer
  onStatusChange: (id: string, status: TaskStatus) => void
}) {
  const isDone = task.status === 'done'
  const isPostponed = task.status === 'postponed'

  const showActions = () => {
    if (isDone) {
      Alert.alert('任务操作', task.title, [
        { text: '标记待办', onPress: () => onStatusChange(task.id, 'pending') },
        { text: '取消', style: 'cancel' },
      ])
      return
    }
    Alert.alert('任务操作', task.title, [
      { text: '✅ 完成', onPress: () => onStatusChange(task.id, 'done') },
      { text: '⏰ 推迟', onPress: () => onStatusChange(task.id, 'postponed') },
      { text: '取消', style: 'cancel' },
    ])
  }

  return (
    <TouchableOpacity
      className={`bg-white rounded-2xl px-4 py-3.5 mb-3 flex-row items-center ${
        isDone ? 'opacity-50' : ''
      }`}
      onPress={showActions}
      activeOpacity={0.7}
    >
      <View className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
        isDone
          ? 'bg-green-500 border-green-500'
          : isPostponed
          ? 'border-amber-400'
          : 'border-gray-300'
      }`}>
        {isDone && <Text className="text-white text-xs">✓</Text>}
        {isPostponed && <Text className="text-amber-400 text-xs">↷</Text>}
      </View>
      <View className="flex-1">
        <Text className={`text-base ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.title}
        </Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          {task.customers && (
            <Text className="text-gray-400 text-xs">👤 {task.customers.name}</Text>
          )}
          {task.notes && (
            <Text className="text-gray-400 text-xs" numberOfLines={1}>· {task.notes}</Text>
          )}
          {isPostponed && (
            <View className="bg-amber-50 rounded px-1.5 py-0.5">
              <Text className="text-amber-500 text-xs">已推迟</Text>
            </View>
          )}
        </View>
      </View>
      <Text className="text-gray-300 text-lg">›</Text>
    </TouchableOpacity>
  )
}

const FILTER_TABS = [
  { key: 'pending',   label: '待办' },
  { key: 'postponed', label: '已推迟' },
  { key: 'done',      label: '已完成' },
]

export default function TasksScreen() {
  const [tasks, setTasks] = useState<TaskWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<TaskStatus>('pending')

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*, customers(name)')
      .order('created_at', { ascending: false })

    if (!error && data) setTasks(data as unknown as TaskWithCustomer[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    await supabase.from('tasks').update({ status }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  const filtered = tasks.filter(t => t.status === filter)
  const pendingCount = tasks.filter(t => t.status === 'pending').length

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-14 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            <Text className="text-2xl font-bold text-gray-800">任务</Text>
            {pendingCount > 0 && (
              <View className="bg-primary-600 rounded-full min-w-5 h-5 px-1.5 items-center justify-center">
                <Text className="text-white text-xs font-bold">{pendingCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            className="bg-primary-600 w-9 h-9 rounded-full items-center justify-center"
            onPress={() => setShowAdd(true)}
          >
            <Text className="text-white text-2xl leading-none mt-[-1]">+</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row bg-gray-100 rounded-xl p-1">
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setFilter(tab.key as TaskStatus)}
              className={`flex-1 py-2 rounded-lg items-center ${
                filter === tab.key ? 'bg-white shadow-sm' : ''
              }`}
            >
              <Text className={`text-sm font-medium ${
                filter === tab.key ? 'text-gray-800' : 'text-gray-400'
              }`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <TaskItem task={item} onStatusChange={handleStatusChange} />
          )}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20">
              <Text className="text-5xl mb-4">✅</Text>
              <Text className="text-gray-400 text-base">
                {filter === 'pending'
                  ? '没有待办任务，点击 + 添加'
                  : filter === 'done'
                  ? '暂无已完成任务'
                  : '暂无推迟任务'}
              </Text>
            </View>
          }
        />
      )}

      <AddTaskModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => {
          setShowAdd(false)
          fetchTasks()
        }}
      />
    </View>
  )
}
