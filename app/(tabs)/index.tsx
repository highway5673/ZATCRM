import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

function getWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { from: monday.toISOString(), to: sunday.toISOString() }
}

type Stats = {
  customerCount: number
  todayTasks: number
  weekTracking: number
  monthlySales: number
}

const TODAY = new Date()
const MONTH_START = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1).toISOString()
const MONTH_END = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

export default function DashboardScreen() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [phone, setPhone] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const fetchStats = useCallback(async () => {
    const { from: weekFrom, to: weekTo } = getWeekRange()

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    const [customersRes, tasksRes, trackingRes, salesRes, userRes] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('tasks').select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('remind_at', todayStart.toISOString())
        .lte('remind_at', todayEnd.toISOString()),
      supabase.from('tracking_records').select('id', { count: 'exact', head: true })
        .gte('tracked_at', weekFrom).lte('tracked_at', weekTo),
      supabase.from('sales_records').select('amount')
        .gte('sale_date', MONTH_START.slice(0, 10))
        .lte('sale_date', MONTH_END.slice(0, 10)),
      supabase.auth.getUser(),
    ])

    const monthlyAmount = (salesRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)

    setStats({
      customerCount: customersRes.count ?? 0,
      todayTasks: tasksRes.count ?? 0,
      weekTracking: trackingRes.count ?? 0,
      monthlySales: monthlyAmount,
    })

    const email = userRes.data.user?.email ?? ''
    setPhone(email.replace('@crm.internal', ''))
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出', style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ])
  }

  const cards = [
    {
      value: stats?.customerCount,
      label: '客户总数',
      valueColor: 'text-[#007AFF]',
      route: '/(tabs)/customers' as const,
    },
    {
      value: stats?.todayTasks,
      label: '今日待办',
      valueColor: 'text-amber-500',
      route: '/(tabs)/tasks' as const,
    },
    {
      value: stats?.weekTracking,
      label: '本周跟踪',
      valueColor: 'text-green-500',
      route: '/(tabs)/tracking' as const,
    },
    {
      value: stats?.monthlySales != null
        ? `¥${stats.monthlySales >= 10000
            ? `${(stats.monthlySales / 10000).toFixed(1)}万`
            : stats.monthlySales.toLocaleString('zh-CN')}`
        : undefined,
      label: '本月销售',
      valueColor: 'text-purple-500',
      route: '/(tabs)/sales' as const,
    },
  ]

  const today = TODAY.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <ScrollView className="flex-1 bg-[#F2F2F7]" contentContainerStyle={{ paddingBottom: 40 }}>
      {/* 顶部 */}
      <View className="bg-white px-5 pt-14 pb-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-3xl font-bold text-gray-900">首页</Text>
            <Text className="text-gray-400 text-sm mt-0.5">{today}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowSettings(s => !s)}
            className="w-9 h-9 items-center justify-center"
          >
            <Text className="text-2xl">⚙️</Text>
          </TouchableOpacity>
        </View>

        {showSettings && (
          <View className="mt-4 bg-[#F2F2F7] rounded-2xl overflow-hidden">
            <View className="px-4 py-3 border-b border-gray-100">
              <Text className="text-xs text-gray-400 uppercase font-semibold">账号</Text>
              <Text className="text-gray-700 mt-1">{phone ? `+86 ${phone}` : '—'}</Text>
            </View>
            <TouchableOpacity
              className="px-4 py-3"
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Text className="text-red-500 font-medium">退出登录</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 统计卡片 */}
      <View className="px-4 pt-5">
        <Text className="text-xs font-semibold text-gray-500 uppercase mb-3 px-1">概览</Text>
        <View className="flex-row flex-wrap gap-3">
          {cards.map((card) => (
            <TouchableOpacity
              key={card.label}
              className="bg-white rounded-2xl p-4 shadow-sm"
              style={{ width: '47%' }}
              onPress={() => card.route && router.push(card.route)}
              activeOpacity={0.7}
            >
              {stats === null ? (
                <ActivityIndicator size="small" color="#D1D5DB" />
              ) : (
                <Text className={`text-3xl font-bold ${card.valueColor}`}>
                  {card.value ?? '0'}
                </Text>
              )}
              <Text className="text-gray-500 text-sm mt-1">{card.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 快捷操作 */}
      <View className="px-4 mt-6">
        <Text className="text-xs font-semibold text-gray-500 uppercase mb-3 px-1">快捷操作</Text>
        <View className="gap-2">
          <TouchableOpacity
            className="bg-white rounded-2xl px-4 py-4 flex-row items-center"
            onPress={() => router.push('/(tabs)/customers')}
            activeOpacity={0.7}
          >
            <Text className="text-2xl mr-3">👥</Text>
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold">管理客户</Text>
              <Text className="text-gray-400 text-xs mt-0.5">查看、新增、搜索客户</Text>
            </View>
            <Text className="text-gray-300 text-xl">›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-white rounded-2xl px-4 py-4 flex-row items-center"
            onPress={() => router.push('/(tabs)/tracking')}
            activeOpacity={0.7}
          >
            <Text className="text-2xl mr-3">📋</Text>
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold">跟踪记录</Text>
              <Text className="text-gray-400 text-xs mt-0.5">记录拜访、电话、微信跟进</Text>
            </View>
            <Text className="text-gray-300 text-xl">›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-white rounded-2xl px-4 py-4 flex-row items-center"
            onPress={() => router.push('/(tabs)/sales')}
            activeOpacity={0.7}
          >
            <Text className="text-2xl mr-3">💰</Text>
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold">销售记录</Text>
              <Text className="text-gray-400 text-xs mt-0.5">记录产品销售与成交</Text>
            </View>
            <Text className="text-gray-300 text-xl">›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-white rounded-2xl px-4 py-4 flex-row items-center"
            onPress={() => router.push('/(tabs)/tasks')}
            activeOpacity={0.7}
          >
            <Text className="text-2xl mr-3">✅</Text>
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold">任务管理</Text>
              <Text className="text-gray-400 text-xs mt-0.5">查看和处理待办事项</Text>
            </View>
            <Text className="text-gray-300 text-xl">›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}
