import { registerWebModule, NativeModule } from 'expo'
import type { AndroidSystemLocation } from './AndroidLocationManager.types'

// AndroidLocationManagerModule is not available on the web platform.
class AndroidLocationManagerModule extends NativeModule<{}> {
  async getCurrentPositionAsync(
    _highAccuracy: boolean,
    _timeoutMs: number,
    _maximumAgeMs: number,
  ): Promise<AndroidSystemLocation> {
    throw new Error('Android LocationManager is only available on Android')
  }
}

export default registerWebModule(AndroidLocationManagerModule, 'AndroidLocationManager')
