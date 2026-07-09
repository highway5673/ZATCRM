import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, TextInput,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { VoiceInputButton } from '../../components/VoiceInputButton'
import type { Task, TaskStatus } from '../../types/database'

type CustomerOption = { id: string; name: string }
type ReminderChoice = 'today' | 'tomorrow' | 'none'

type TaskVoiceFields = {
  customer_name?: string | null
  title?: string | null
  notes?: string | null
  reminder?: ReminderChoice | null
}

const REMINDER_OPTIONS: { key: ReminderChoice; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'tomorrow', label: '明天' },
  { key: 'none', label: '无提醒' },
]

function getReminderAt(choice: ReminderChoice) {
  if (choice === 'none') return null

  const date = new Date()
  if (choice === 'tomorrow') date.setDate(date.getDate() + 1)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

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
  const [reminder, setReminder] = useState<ReminderChoice>('today')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      supabase.from('customers').select('id, name').order('name').then(({ data }) => {
        if (data) setCustomers(data)
      })
    }
  }, [visible])

  const reset = () => { setTitle(''); setNotes(''); setCustomerId(''); setReminder('today') }
  const handleClose = () => { reset(); onClose() }

  const findCustomerId = (name?: string | null) => {
    if (!name) return ''
    const text = name.trim()
    const matched = customers.find(c => c.name === text || c.name.includes(text) || text.includes(c.name))
    return matched?.id ?? ''
  }

  const applyVoiceFields = (fields: TaskVoiceFields) => {
    if (fields.title) setTitle(fields.title)
    if (fields.notes) setNotes(fields.notes)
    if (fields.reminder) setReminder(fields.reminder)
    if (fields.customer_name) {
      const matchedId = findCustomerId(fields.customer_name)
      if (matchedId) setCustomerId(matchedId)
    }
  }

  const saveTask = async (fields?: TaskVoiceFields) => {
    const nextTitle = (fields?.title ?? title).trim()
    const nextNotes = (fields?.notes ?? notes).trim()
    const nextCustomerId = customerId || findCustomerId(fields?.customer_name)
    const nextReminder = fields?.reminder ?? reminder

    if (!nextTitle) throw new Error('请输入任务标题')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); throw new Error('登录已失效') }

    const { error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title: nextTitle,
      notes: nextNotes || null,
      customer_id: nextCustomerId || null,
      remind_at: getReminderAt(nextReminder),
      status: 'pending' as TaskStatus,
    })

    setSaving(false)
    if (error) throw error
    reset()
    onSaved()
  }

  const handleSave = async () => {
    try {
      await saveTask()
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
          <Text className="text-base font-semibold text-gray-800">新增任务</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#007AFF" />
              : <Text className="text-[#007AFF] text-base font-semibold">保存</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="mx-4 mt-4">
            <VoiceInputButton<TaskVoiceFields>
              formType="task"
              title="语音新增任务"
              scriptLines={[
                '任务：明天上午给张三发送报价单',
                '关联客户：张三，提醒：今天 / 明天 / 无提醒',
                '备注：附上产品参数和优惠方案',
              ]}
              disabled={saving}
              onApply={applyVoiceFields}
              onSubmit={saveTask}
            />
          </View>

          <View className="mx-4 mt-4 bg-white rounded-2xl overflow-hidden">
            <View className="px-4 pt-4 pb-2 border-b border-gray-50">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-2">任务标题 *</Text>
              <TextInput
                className="text-base text-gray-900 pb-2"
                placeholder="例：给张三发送报价单"
                placeholderTextColor="#9CA3AF"
                value={title}
                onChangeText={setTitle}
                autoFocus
              />
            </View>
            <View className="px-4 pt-4 pb-4">
              <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">关联客户（可选）</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setCustomerId('')}
                    className={`px-3 py-2 rounded-xl border ${
                      !customerId ? 'bg-[#007AFF] border-[#007AFF]' : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text className={`text-sm ${!customerId ? 'text-white font-medium' : 'text-gray-400'}`}>
                      无
                    </Text>
                  </TouchableOpacity>
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
                      <Text className={`text-sm ${customerId === c.id ? 'text-white font-medium' : 'text-gray-700'}`}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>

          <View className="mx-4 mt-4 bg-white rounded-2xl p-4">
            <Text className="text-xs text-gray-400 uppercase font-semibold mb-3">提醒日期</Text>
            <View className="flex-row bg-gray-100 rounded-xl p-1">
              {REMINDER_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setReminder(option.key)}
                  className={`flex-1 py-2 rounded-lg items-center ${
                    reminder === option.key ? 'bg-white shadow-sm' : ''
                  }`}
                >
                  <Text className={`text-sm font-medium ${
                    reminder === option.key ? 'text-gray-800' : 'text-gray-400'
                  }`}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="mx-4 mt-4 mb-8 bg-white rounded-2xl p-4">
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
              style={{ minHeight: 80 }}
            />
          </View>
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
    <View className="flex-1 bg-[#F2F2F7]">
      <View className="bg-white px-5 pt-14 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-2">
            <Text className="text-3xl font-bold text-gray-900">任务</Text>
            {pendingCount > 0 && (
              <View className="bg-[#007AFF] rounded-full min-w-5 h-5 px-1.5 items-center justify-center">
                <Text className="text-white text-xs font-bold">{pendingCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            className="bg-[#007AFF] w-9 h-9 rounded-full items-center justify-center"
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
          <ActivityIndicator size="large" color="#007AFF" />
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
