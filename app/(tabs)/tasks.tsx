import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, TextInput,
} from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { perfLog, perfNow, trackPerf } from '../../lib/perf'
import { VoiceInputButton } from '../../components/VoiceInputButton'
import type { Task, TaskStatus } from '../../types/database'

type CustomerOption = { id: string; name: string; company: string | null }
type ReminderChoice = 'today' | 'tomorrow' | 'none'

type TaskVoiceFields = {
  customer_name?: string | null
  title?: string | null
  notes?: string | null
  reminder?: ReminderChoice | null
}

function getVoiceReminderAt(choice: ReminderChoice) {
  const date = new Date()
  if (choice === 'tomorrow') date.setDate(date.getDate() + 1)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

function formatDateLabel(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTimeLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function AddTaskModal({
  visible,
  onClose,
  onSaved,
  defaultCustomer,
}: {
  visible: boolean
  onClose: () => void
  onSaved: () => void
  defaultCustomer?: CustomerOption | null
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [reminderAt, setReminderAt] = useState(() => {
    const date = new Date()
    date.setHours(9, 0, 0, 0)
    return date
  })
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null)
  const [saving, setSaving] = useState(false)

  const searchCustomers = useCallback(async (keyword: string) => {
    const text = keyword.trim()
    if (!text) return []
    const { data } = await trackPerf('tasks.add.searchCustomers', () =>
      supabase
        .from('customers')
        .select('id, name, company')
        .or(`name.ilike.%${text}%,company.ilike.%${text}%`)
        .order('name')
        .limit(9),
    { keyword: text })
    return data ?? []
  }, [])

  useEffect(() => {
    if (visible) {
      setCustomerId(defaultCustomer?.id ?? '')
      setCustomerSearch(defaultCustomer?.name ?? '')
      setCustomers(defaultCustomer ? [defaultCustomer] : [])
    }
  }, [visible, defaultCustomer])

  useEffect(() => {
    if (!visible) return
    const keyword = customerSearch.trim()
    if (!keyword) {
      setCustomers(defaultCustomer && defaultCustomer.id === customerId ? [defaultCustomer] : [])
      return
    }

    const timeoutId = setTimeout(() => {
      void searchCustomers(keyword).then((data) => {
        const merged = defaultCustomer && defaultCustomer.id === customerId
          ? [defaultCustomer, ...data.filter(c => c.id !== defaultCustomer.id)]
          : data
        setCustomers(merged)
      })
    }, 250)

    return () => clearTimeout(timeoutId)
  }, [visible, customerSearch, customerId, defaultCustomer, searchCustomers])

  const reset = () => {
    const date = new Date()
    date.setHours(9, 0, 0, 0)
    setTitle('')
    setNotes('')
    setCustomerId(defaultCustomer?.id ?? '')
    setCustomerSearch(defaultCustomer?.name ?? '')
    setCustomers(defaultCustomer ? [defaultCustomer] : [])
    setReminderEnabled(true)
    setReminderAt(date)
    setPickerMode(null)
  }
  const handleClose = () => { reset(); onClose() }

  const findCustomerId = (name?: string | null) => {
    if (!name) return ''
    const text = name.trim()
    const matched = customers.find(c =>
      c.name === text ||
      c.name.includes(text) ||
      text.includes(c.name) ||
      (c.company ? c.company.includes(text) || text.includes(c.company) : false))
    return matched?.id ?? ''
  }

  const findCustomerIdFromDatabase = async (name?: string | null) => {
    if (!name) return ''
    const text = name.trim()
    const results = await searchCustomers(text)
    const matched = results.find(c =>
      c.name === text ||
      c.name.includes(text) ||
      text.includes(c.name) ||
      (c.company ? c.company.includes(text) || text.includes(c.company) : false))
    return matched?.id ?? ''
  }

  const applyVoiceFields = (fields: TaskVoiceFields) => {
    if (fields.title) setTitle(fields.title)
    if (fields.notes) setNotes(fields.notes)
    if (fields.reminder) {
      setReminderEnabled(fields.reminder !== 'none')
      if (fields.reminder !== 'none') setReminderAt(new Date(getVoiceReminderAt(fields.reminder)))
    }
    if (fields.customer_name) {
      const matchedId = findCustomerId(fields.customer_name)
      if (matchedId) setCustomerId(matchedId)
      setCustomerSearch(fields.customer_name)
    }
  }

  const saveTask = async (fields?: TaskVoiceFields) => {
    const startedAt = perfNow()
    const nextTitle = (fields?.title ?? title).trim()
    const nextNotes = (fields?.notes ?? notes).trim()
    const nextCustomerId = customerId || findCustomerId(fields?.customer_name) || await findCustomerIdFromDatabase(fields?.customer_name)
    const nextReminderAt = fields?.reminder
      ? fields.reminder === 'none' ? null : getVoiceReminderAt(fields.reminder)
      : reminderEnabled ? reminderAt.toISOString() : null

    if (!nextTitle) throw new Error('请输入任务标题')
    try {
      setSaving(true)
      const { data: { user } } = await trackPerf('tasks.add.getUser', () => supabase.auth.getUser())
      if (!user) { setSaving(false); throw new Error('登录已失效') }

      const { error } = await trackPerf('tasks.add.insert', () =>
        supabase.from('tasks').insert({
          user_id: user.id,
          title: nextTitle,
          notes: nextNotes || null,
          customer_id: nextCustomerId || null,
          remind_at: nextReminderAt,
          status: 'pending' as TaskStatus,
        }),
      { hasCustomer: Boolean(nextCustomerId), hasReminder: Boolean(nextReminderAt) })

      setSaving(false)
      if (error) throw error
      reset()
      onSaved()
    } finally {
      perfLog('tasks.add.total', startedAt)
    }
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

  const selectedCustomer = customers.find(c => c.id === customerId)

  const handlePickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setPickerMode(null)
    if (!selectedDate) return

    setReminderAt((current) => {
      const next = new Date(current)
      if (pickerMode === 'date') {
        next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
      } else {
        next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0)
      }
      return next
    })
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
                '任务内容：给客户发送报价单，确认产品型号和价格',
                '关联客户：张三',
                '提醒：今天 / 明天 / 无提醒',
                '备注：附上产品参数、优惠方案和报价有效期',
                '提示：先说要完成的任务内容，再补充客户、提醒和执行细节；不需要提醒可以说无提醒',
              ]}
              disabled={saving}
              submitMode="fill"
              onApply={applyVoiceFields}
              onSubmit={saveTask}
            />
          </View>

          <View className="mx-4 mt-4 bg-white rounded-lg overflow-hidden">
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
              <TextInput
                className="text-base text-gray-900 border border-gray-100 rounded-lg px-3 py-2.5"
                placeholder="输入客户名称搜索"
                placeholderTextColor="#9CA3AF"
                value={customerSearch}
                onChangeText={(text) => {
                  setCustomerSearch(text)
                  setCustomerId('')
                }}
              />
              {selectedCustomer ? (
                <Text className="text-[#007AFF] text-xs mt-2">
                  已选择：{selectedCustomer.name}{selectedCustomer.company ? ` · ${selectedCustomer.company}` : ''}
                </Text>
              ) : null}
              <View className="mt-3 flex-row flex-wrap gap-2">
                {customers.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => {
                      setCustomerId(c.id)
                      setCustomerSearch(c.name)
                    }}
                    className={`px-2 py-2.5 rounded-lg border items-center ${
                      customerId === c.id
                        ? 'bg-[#007AFF] border-[#007AFF]'
                        : 'bg-white border-gray-200'
                    }`}
                    style={{ width: '31%' }}
                  >
                    <Text
                      className={`text-sm font-medium text-center ${customerId === c.id ? 'text-white' : 'text-gray-700'}`}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    {c.company ? (
                      <Text
                        className={`text-xs mt-0.5 text-center ${customerId === c.id ? 'text-blue-100' : 'text-gray-400'}`}
                        numberOfLines={1}
                      >
                        {c.company}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
                {customerSearch.trim() && customers.length === 0 ? (
                  <Text className="text-gray-400 text-sm">没有匹配客户，请换个关键词</Text>
                ) : null}
                {!customerSearch.trim() && !customerId ? (
                  <Text className="text-gray-400 text-sm">输入客户名称后显示候选客户</Text>
                ) : null}
                {customerId ? (
                  <TouchableOpacity
                    className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white"
                    onPress={() => {
                      setCustomerId('')
                      setCustomerSearch('')
                      setCustomers([])
                    }}
                    activeOpacity={0.75}
                  >
                    <Text className="text-gray-400 text-sm">清除关联</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          <View className="mx-4 mt-4 bg-white rounded-lg p-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs text-gray-400 uppercase font-semibold">提醒时间</Text>
              <TouchableOpacity
                className={`rounded-full px-3 py-1.5 ${reminderEnabled ? 'bg-blue-50' : 'bg-gray-100'}`}
                onPress={() => setReminderEnabled(prev => !prev)}
                activeOpacity={0.75}
              >
                <Text className={`text-xs font-semibold ${reminderEnabled ? 'text-[#007AFF]' : 'text-gray-400'}`}>
                  {reminderEnabled ? '已开启' : '不提醒'}
                </Text>
              </TouchableOpacity>
            </View>
            {reminderEnabled ? (
              <>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    className="flex-1 border border-gray-100 rounded-lg px-3 py-3"
                    onPress={() => setPickerMode('date')}
                    activeOpacity={0.75}
                  >
                    <Text className="text-gray-400 text-xs mb-1">日期</Text>
                    <Text className="text-gray-900 text-base font-medium">{formatDateLabel(reminderAt)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 border border-gray-100 rounded-lg px-3 py-3"
                    onPress={() => setPickerMode('time')}
                    activeOpacity={0.75}
                  >
                    <Text className="text-gray-400 text-xs mb-1">时间</Text>
                    <Text className="text-gray-900 text-base font-medium">{formatTimeLabel(reminderAt)}</Text>
                  </TouchableOpacity>
                </View>
                {pickerMode ? (
                  <DateTimePicker
                    value={reminderAt}
                    mode={pickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handlePickerChange}
                  />
                ) : null}
              </>
            ) : (
              <Text className="text-gray-400 text-sm">该任务不会设置提醒时间</Text>
            )}
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
      className={`bg-white rounded-lg px-4 py-3.5 mb-3 flex-row items-center ${
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
  const params = useLocalSearchParams<{ createTask?: string; customerId?: string; customerName?: string }>()
  const router = useRouter()
  const handledCreateKeyRef = useRef('')
  const [tasks, setTasks] = useState<TaskWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<TaskStatus>('pending')

  const defaultCustomer = useMemo<CustomerOption | null>(() => {
    if (!params.customerId || !params.customerName) return null
    return {
      id: params.customerId,
      name: params.customerName,
      company: null,
    }
  }, [params.customerId, params.customerName])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const { data, error } = await trackPerf('tasks.fetchList', () =>
      supabase
        .from('tasks')
        .select('*, customers(name)')
        .order('created_at', { ascending: false }))

    if (!error && data) setTasks(data as unknown as TaskWithCustomer[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (params.createTask !== '1') return
    const createKey = `${params.customerId ?? ''}:${params.customerName ?? ''}`
    if (handledCreateKeyRef.current === createKey) return

    handledCreateKeyRef.current = createKey
    setShowAdd(true)
  }, [params.createTask, params.customerId, params.customerName])

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    await trackPerf('tasks.updateStatus', () =>
      supabase.from('tasks').update({ status }).eq('id', id),
    { status })
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  const closeAddTask = () => {
    setShowAdd(false)
    router.setParams({ createTask: undefined, customerId: undefined, customerName: undefined })
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

        <View className="flex-row bg-gray-100 rounded-lg p-1">
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setFilter(tab.key as TaskStatus)}
              className={`flex-1 py-2 rounded-lg items-center ${
                filter === tab.key ? 'bg-white ' : ''
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
        defaultCustomer={defaultCustomer}
        onClose={closeAddTask}
        onSaved={() => {
          closeAddTask()
          fetchTasks()
        }}
      />
    </View>
  )
}
