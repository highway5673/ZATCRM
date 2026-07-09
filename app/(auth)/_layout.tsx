import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useSession } from '../../lib/session'

export default function AuthLayout() {
  const session = useSession()
  if (session === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F2F2F7]">
        <ActivityIndicator color="#007AFF" />
      </View>
    )
  }
  if (session) return <Redirect href="/(tabs)" />
  return <Stack screenOptions={{ headerShown: false }} />
}
