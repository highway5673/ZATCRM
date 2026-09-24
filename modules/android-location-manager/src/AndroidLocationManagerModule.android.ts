import { NativeModule, requireNativeModule } from 'expo'
import type { AndroidSystemLocation } from './AndroidLocationManager.types'

declare class AndroidLocationManagerModule extends NativeModule<{}> {
  getCurrentPositionAsync(
    highAccuracy: boolean,
    timeoutMs: number,
    maximumAgeMs: number,
    maximumAccuracyMeters: number,
  ): Promise<AndroidSystemLocation>
}

export default requireNativeModule<AndroidLocationManagerModule>('AndroidLocationManager')
