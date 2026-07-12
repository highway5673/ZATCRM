import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../../lib/session'
import { AppSymbol, type AppSymbolName } from '../../components/AppSymbol'

function TabIcon({ name, focused }: { name: AppSymbolName; focused: boolean }) {
  return <AppSymbol name={name} size={23} color={focused ? '#D5A64A' : '#A9B6C2'} />
}

export default function TabsLayout() {
  const session = useSession()
  const insets = useSafeAreaInsets()
  // 部分启用透明系统导航栏的 Android 设备会错误地返回 bottom=0。
  // 强制保留手势条空间，避免标签被系统导航区域覆盖。
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 32 : 8)
  if (session === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#284D6B" />
      </View>
    )
  }
  if (session === null) return <Redirect href="/(auth)/login" />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#D5A64A',
        tabBarInactiveTintColor: '#A9B6C2',
        tabBarStyle: {
          height: 66 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
          backgroundColor: '#17324D',
          borderTopColor: '#284D6B',
        },
        tabBarItemStyle: {
          minHeight: 58,
          paddingTop: 3,
          paddingBottom: 4,
        },
        tabBarIconStyle: {
          marginTop: 1,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          lineHeight: 17,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: '客户',
          tabBarIcon: ({ focused }) => <TabIcon name="customers" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: '跟踪',
          tabBarIcon: ({ focused }) => <TabIcon name="tracking" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: '销售',
          tabBarIcon: ({ focused }) => <TabIcon name="sales" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: '任务',
          tabBarIcon: ({ focused }) => <TabIcon name="tasks" focused={focused} />,
        }}
      />
    </Tabs>
  )
}
