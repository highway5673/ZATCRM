import '../global.css'
import Constants from 'expo-constants'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { SessionProvider } from '../lib/session'

// Expo Go cannot customize native splash animations. Keep the animation for
// development and release builds while avoiding a noisy warning in Expo Go.
if (!Constants.expoGoConfig) {
  SplashScreen.setOptions({
    duration: 500,
    fade: true,
  })
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionProvider>
  )
}
