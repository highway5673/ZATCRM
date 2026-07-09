import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, TextInput,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import type { Opportunity, OpportunityStage } from '../../types/database'

const STAGES: { key: OpportunityStage; label: string; color: string; dot: string }[] = [
  { key: 'initial_contact', label: '初步接触', color: 'bg-gray-100', dot: 'bg-gray-400' },
  { key: 'interested',      label: '有意向',   color: 'bg-blue-50',  dot: 'bg-blue-500' },
  { key: 'quoting',         label: '报价中',   color: 'bg-amber-50', dot: 'bg-amber-500' },
  { key: 'negotiating',     label: '谈判中',   color: 'bg-purple-50', dot: 'bg-purple-500' },
  { key: 'won',             label: '已成交',   color: 'bg-green-50', dot: 'bg-green-500' },
  { key: 'lost',            label: '已失单',   color: 'bg-red-50',   dot: 'bg-red-400' },
]

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]))

type CustomerOption = { id: string; name: string; company: string | null }

function AddOpportunityModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [product, setProduct] = useState('')
  const [amount, setAmount] = useState('')
  const [stage, setStage] = useState<OpportunityStage>('initial_contact')
  const [customerId, setCustomerId] = useState('')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      supabase.from('customers').select('id, name, company').order('name').then(({ data }) => {
        if (data) setCustomers(data)
      })
    }
  }, [visible])

  const reset = () => {
    setTitle('')
    setProduct('')
    setAmount('')
    setStage('initial_contact')
    setCustomerId('')
  }

  const handleClose = () => { reset(); onClose() }

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('提示', '请输入商机标题'); return }
    if (!customerId) { Alert.alert('提示', '请选择关联客户'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error } = await supabase.from('opportunities').insert({
      user_id: user.id,
      customer_id: customerId,
      title: title.trim(),
      product: product.trim() || null,
      estimated_amount: amount ? parseFloat(amount) : null,
      stage,
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
          <Text className="text-base font-semibold text-gray-800">新增商机</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#2563EB" />
              : <Text className="text-primary-600 text-base font-semibold">保存</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-gray-500 mb-1">商机标题 *</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base"
            placeholder="例：XX公司采购项目"
            value={title}
            onChangeText={setTitle}
          />

          <Text className="text-sm text-gray-500 mb-2">关联客户 *</Text>
          {customers.length === 0 ? (
            <Text className="text-gray-400 text-sm mb-4">请先在「客户」页添加客户</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row gap-2">
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

          <Text className="text-sm text-gray-500 mb-1">产品/服务</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base"
            placeholder="例：XX产品"
            value={product}
            onChangeText={setProduct}
          />

          <Text className="text-sm text-gray-500 mb-1">预估金额（元）</Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base"
            placeholder="例：50000"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <Text className="text-sm text-gray-500 mb-2">当前阶段</Text>
          <View className="gap-2 mb-8">
            {STAGES.map(s => (
              <TouchableOpacity
                key={s.key}
                onPress={() => setStage(s.key)}
                className={`flex-row items-center px-4 py-3 rounded-xl border ${
                  stage === s.key ? 'border-primary-600 bg-primary-50' : 'border-gray-200 bg-white'
                }`}
              >
                <View className={`w-2.5 h-2.5 rounded-full ${s.dot} mr-3`} />
                <Text className={`text-sm ${stage === s.key ? 'text-primary-700 font-medium' : 'text-gray-600'}`}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

type OpportunityWithCustomer = Opportunity & { customers: { name: string; company: string | null } | null }

function OpportunityCard({
  item,
  onStageChange,
}: {
  item: OpportunityWithCustomer
  onStageChange: (id: string, stage: OpportunityStage) => void
}) {
  const stageInfo = STAGE_MAP[item.stage]

  const cycleStage = () => {
    const stages = STAGES.map(s => s.key)
    const currentIndex = stages.indexOf(item.stage)
    const nextStage = stages[(currentIndex + 1) % stages.length]
    onStageChange(item.id, nextStage)
  }

  return (
    <View className="bg-white rounded-2xl p-4 mb-3">
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-gray-800 font-semibold text-base">{item.title}</Text>
          {item.customers && (
            <Text className="text-gray-400 text-sm mt-0.5">
              {item.customers.name}{item.customers.company ? ` · ${item.customers.company}` : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={cycleStage}
          className={`px-3 py-1 rounded-full ${stageInfo.color}`}
        >
          <View className="flex-row items-center gap-1.5">
            <View className={`w-2 h-2 rounded-full ${stageInfo.dot}`} />
            <Text className="text-xs font-medium text-gray-600">{stageInfo.label}</Text>
          </View>
        </TouchableOpacity>
      </View>
      <View className="flex-row items-center gap-4">
        {item.product && (
          <Text className="text-gray-400 text-sm">📦 {item.product}</Text>
        )}
        {item.estimated_amount && (
          <Text className="text-green-600 text-sm font-medium">
            ¥{item.estimated_amount.toLocaleString('zh-CN')}
          </Text>
        )}
      </View>
    </View>
  )
}

const FILTER_TABS = [
  { key: 'active', label: '跟进中' },
  { key: 'won',    label: '已成交' },
  { key: 'lost',   label: '已失单' },
]

export default function OpportunitiesScreen() {
  const [opportunities, setOpportunities] = useState<OpportunityWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<'active' | 'won' | 'lost'>('active')

  const fetchOpportunities = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('opportunities')
      .select('*, customers(name, company)')
      .order('updated_at', { ascending: false })

    if (!error && data) setOpportunities(data as unknown as OpportunityWithCustomer[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOpportunities()
  }, [fetchOpportunities])

  const handleStageChange = async (id: string, stage: OpportunityStage) => {
    await supabase.from('opportunities').update({ stage }).eq('id', id)
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, stage } : o))
  }

  const filtered = opportunities.filter(o => {
    if (filter === 'won') return o.stage === 'won'
    if (filter === 'lost') return o.stage === 'lost'
    return o.stage !== 'won' && o.stage !== 'lost'
  })

  const wonTotal = opportunities
    .filter(o => o.stage === 'won')
    .reduce((sum, o) => sum + (o.estimated_amount ?? 0), 0)

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white px-5 pt-14 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-bold text-gray-800">商机</Text>
          <TouchableOpacity
            className="bg-primary-600 w-9 h-9 rounded-full items-center justify-center"
            onPress={() => setShowAdd(true)}
          >
            <Text className="text-white text-2xl leading-none mt-[-1]">+</Text>
          </TouchableOpacity>
        </View>

        {wonTotal > 0 && (
          <View className="bg-green-50 rounded-xl px-4 py-2.5 mb-3 flex-row items-center">
            <Text className="text-green-600 text-sm">已成交金额：</Text>
            <Text className="text-green-700 font-bold text-sm">
              ¥{wonTotal.toLocaleString('zh-CN')}
            </Text>
          </View>
        )}

        <View className="flex-row bg-gray-100 rounded-xl p-1">
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setFilter(tab.key as typeof filter)}
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
            <OpportunityCard item={item} onStageChange={handleStageChange} />
          )}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20">
              <Text className="text-5xl mb-4">💰</Text>
              <Text className="text-gray-400 text-base">
                {filter === 'active' ? '暂无跟进中的商机' : filter === 'won' ? '暂无成交记录' : '暂无失单记录'}
              </Text>
            </View>
          }
        />
      )}

      <AddOpportunityModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => {
          setShowAdd(false)
          fetchOpportunities()
        }}
      />
    </View>
  )
}
