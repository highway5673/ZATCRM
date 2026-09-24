import type { AndroidSystemLocation } from './AndroidLocationManager.types'

const AndroidLocationManagerModule = {
  async getCurrentPositionAsync(
    _highAccuracy: boolean,
    _timeoutMs: number,
    _maximumAgeMs: number,
    _maximumAccuracyMeters: number,
  ): Promise<AndroidSystemLocation> {
    throw new Error('Android LocationManager is only available on Android')
  },
}

export default AndroidLocationManagerModule
