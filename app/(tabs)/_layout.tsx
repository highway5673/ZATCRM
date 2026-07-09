import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { useSession } from '../../lib/session'

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View
      className={`w-7 h-7 rounded-lg items-center justify-center ${
        focused ? 'bg-[#007AFF]' : 'bg-transparent'
      }`}
    >
      <Text className={`text-xs font-bold ${focused ? 'text-white' : 'text-gray-400'}`}>
        {label}
      </Text>
    </View>
  )
}

export default function TabsLayout() {
  const session = useSession()
  if (session === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F2F2F7]">
        <ActivityIndicator color="#007AFF" />
      </View>
    )
  }
  if (session === null) return <Redirect href="/(auth)/login" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopColor: '#E5E5EA',
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ focused }) => <TabIcon label="首" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: '客户',
          tabBarIcon: ({ focused }) => <TabIcon label="客" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: '跟踪',
          tabBarIcon: ({ focused }) => <TabIcon label="跟" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: '销售',
          tabBarIcon: ({ focused }) => <TabIcon label="售" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: '任务',
          tabBarIcon: ({ focused }) => <TabIcon label="办" focused={focused} />,
        }}
      />
    </Tabs>
  )
}
