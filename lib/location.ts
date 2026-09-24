import * as ExpoLocation from 'expo-location'
import * as Linking from 'expo-linking'
import { Alert, Platform } from 'react-native'
import AndroidLocationManager from '../modules/android-location-manager'
import { perfLog, perfNow, trackPerf } from './perf'
import { supabase } from './supabase'
import type { CustomerLocation } from '../types/database'

const DEDUP_METERS = 300
const GEOCODE_TIMEOUT_MS = 8000
const FUSED_LOCATION_FIX_TIMEOUT_MS = 12000
const ANDROID_LOCATION_MANAGER_TIMEOUT_MS = 60_000
const FALLBACK_LOCATION_MAX_AGE_MS = 2 * 60_000
const MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS = 500

type BigDataCloudAddress = {
  principalSubdivision?: string
  city?: string
  locality?: string
  postcode?: string
  localityInfo?: {
    administrative?: { name?: string }[]
    informative?: { name?: string }[]
  }
}

type NominatimAddress = {
  display_name?: string
  address?: Record<string, string | undefined>
}

function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function requestLocationPermission(): Promise<ExpoLocation.LocationPermissionResponse> {
  return trackPerf('location.permission', () =>
    ExpoLocation.requestForegroundPermissionsAsync())
}

type CurrentCoords = {
  latitude: number
  longitude: number
  source: 'lastKnown' | 'fused' | 'androidLocationManager'
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

async function getAndroidLocationManagerCoords(highAccuracy: boolean): Promise<CurrentCoords> {
  const position = await AndroidLocationManager.getCurrentPositionAsync(
    highAccuracy,
    ANDROID_LOCATION_MANAGER_TIMEOUT_MS,
    FALLBACK_LOCATION_MAX_AGE_MS,
    MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
  )
  if (position.accuracy > MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS) {
    throw new Error(`Android system location is too imprecise: ${Math.round(position.accuracy)}m`)
  }
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    source: 'androidLocationManager',
  }
}

async function getFusedCurrentCoords(): Promise<CurrentCoords> {
  const loc = await withTimeout(
    ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.High,
      mayShowUserSettingsDialog: true,
    }),
    FUSED_LOCATION_FIX_TIMEOUT_MS,
    'Google融合定位超时',
  )
  if (loc.coords.accuracy != null && loc.coords.accuracy > MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS) {
    throw new Error(`Fused location is too imprecise: ${Math.round(loc.coords.accuracy)}m`)
  }
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, source: 'fused' }
}

function firstSuccessful<T>(attempts: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let remaining = attempts.length
    const errors: string[] = []

    if (remaining === 0) {
      reject(new Error('No location provider is available'))
      return
    }

    attempts.forEach((attempt) => {
      attempt.then(resolve, (error) => {
        errors.push(error instanceof Error ? error.message : String(error))
        remaining -= 1
        if (remaining === 0) reject(new Error(errors.join(' | ')))
      })
    })
  })
}

export async function getCurrentCoords(highAccuracy = true): Promise<CurrentCoords | null> {
  let lastKnown: ExpoLocation.LocationObject | null = null
  try {
    lastKnown = await trackPerf('location.lastKnownPosition', () =>
      ExpoLocation.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 100,
      }))
  } catch {
    // A cached-position lookup must not prevent a fresh location attempt.
  }

  if (lastKnown) {
    return {
      latitude: lastKnown.coords.latitude,
      longitude: lastKnown.coords.longitude,
      source: 'lastKnown',
    }
  }

  if (Platform.OS === 'android') {
    try {
      return await trackPerf('location.firstAvailablePosition', () =>
        firstSuccessful([
          trackPerf('location.androidLocationManager', () =>
            getAndroidLocationManagerCoords(highAccuracy)),
          trackPerf('location.fusedPosition', getFusedCurrentCoords),
        ]))
    } catch {
      // Continue to a relaxed cached-position fallback below.
    }
  } else {
    try {
      return await trackPerf('location.fusedPosition', getFusedCurrentCoords)
    } catch {
      // Continue to a relaxed cached-position fallback below.
    }
  }

  try {
    const fallback = await trackPerf('location.lastKnownPositionFallback', () =>
      ExpoLocation.getLastKnownPositionAsync({
        maxAge: FALLBACK_LOCATION_MAX_AGE_MS,
        requiredAccuracy: MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS,
      }))
    if (fallback) {
      return {
        latitude: fallback.coords.latitude,
        longitude: fallback.coords.longitude,
        source: 'lastKnown',
      }
    }
  } catch {
    // All location providers failed.
  }

  return null
}

async function fetchJsonWithTimeout<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json() as T
  } finally {
    clearTimeout(timeoutId)
  }
}

function compactAddressParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>()
  return parts
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      if (seen.has(part)) return false
      seen.add(part)
      return true
    })
    .join('')
}

async function reverseGeocodeWithBigDataCloud(lat: number, lon: number): Promise<string | null> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`
  const result = await trackPerf('location.reverseGeocode.bigDataCloud', () =>
    fetchJsonWithTimeout<BigDataCloudAddress>(url))

  const district = result.localityInfo?.administrative?.find(item => item.name?.endsWith('区') || item.name?.endsWith('县'))?.name
  const street = result.localityInfo?.informative?.find(item => item.name && item.name.length > 1)?.name
  const address = compactAddressParts([
    result.principalSubdivision,
    result.city,
    district,
    result.locality,
    street,
  ])

  return address || result.locality || result.city || null
}

async function reverseGeocodeWithNominatim(lat: number, lon: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=zh-CN`
  const result = await trackPerf('location.reverseGeocode.nominatim', () =>
    fetchJsonWithTimeout<NominatimAddress>(url, {
      'User-Agent': 'ZATCRM/1.0 reverse-geocode',
    }))

  const address = result.address
  if (!address) return result.display_name ?? null

  return compactAddressParts([
    address.state,
    address.city || address.town || address.county,
    address.suburb || address.city_district || address.district,
    address.road || address.pedestrian,
    address.house_number,
  ]) || result.display_name || null
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const [result] = await trackPerf('location.reverseGeocode', () =>
      ExpoLocation.reverseGeocodeAsync({ latitude: lat, longitude: lon }))
    const nativeAddress = result ? [result.region, result.city, result.district, result.street, result.streetNumber]
      .filter(Boolean)
      .join('')
      || result.formattedAddress
      || null : null
    if (nativeAddress) return nativeAddress
  } catch {
    // Fall through to HTTP-based providers below. Android's native geocoder can time out.
  }

  try {
    return await reverseGeocodeWithBigDataCloud(lat, lon)
  } catch {
    try {
      return await reverseGeocodeWithNominatim(lat, lon)
    } catch {
      return null
    }
  }
}

export async function resolveAddressForCoords(lat: number, lon: number): Promise<string | null> {
  return reverseGeocode(lat, lon)
}

export type LocationResult =
  { locationId: string; address: string | null; isNew: boolean }

export async function resolveVisitLocation(customerId: string): Promise<LocationResult> {
  const startedAt = perfNow()
  let coordinateSource: CurrentCoords['source'] | null = null

  try {
    const permission = await requestLocationPermission()
    if (!permission.granted) {
      throw new Error('需要定位权限才能保存上门拜访，请在系统设置中允许访问位置后重试')
    }

    const servicesEnabled = await trackPerf('location.servicesEnabled', () =>
      ExpoLocation.hasServicesEnabledAsync())
    if (!servicesEnabled) {
      throw new Error('手机定位服务未开启，请开启定位服务后重试')
    }

    const highAccuracy = Platform.OS !== 'android' || permission.android?.accuracy !== 'coarse'
    const coords = await getCurrentCoords(highAccuracy)
    if (!coords) {
      if (!highAccuracy) {
        throw new Error('系统只授予了大致位置权限，请在应用权限设置中开启“精确位置”后重试')
      }
      throw new Error('已尝试GPS、网络定位和系统融合定位，但在等待时间内仍未获得有效坐标，请保持当前页面打开后重试')
    }
    coordinateSource = coords.source

    const { data: existing, error: lookupError } = await trackPerf('location.lookupExisting', () =>
      supabase
        .from('customer_locations')
        .select('*')
        .eq('customer_id', customerId),
    { customerId })

    if (lookupError) {
      throw new Error('读取客户已有地址失败，请检查网络后重试')
    }

    const nearby = (existing ?? []).find(
      (loc: CustomerLocation) =>
        haversineMeters(coords.latitude, coords.longitude, loc.latitude, loc.longitude) <= DEDUP_METERS,
    )

    if (nearby) {
      let address = nearby.address
      if (!address?.trim()) {
        address = await reverseGeocode(coords.latitude, coords.longitude)
        if (address) {
          const { data: updated, error: updateError } = await trackPerf('location.updateAddress', () =>
            supabase
              .from('customer_locations')
              .update({ address })
              .eq('id', nearby.id)
              .eq('customer_id', customerId)
              .select('id')
              .maybeSingle(),
          { customerId, locationId: nearby.id })

          if (updateError || !updated) {
            throw new Error('更新客户当前地址失败，请检查网络后重试')
          }
        }
      }
      return { locationId: nearby.id, address, isNew: false }
    }

    const address = await reverseGeocode(coords.latitude, coords.longitude)

    const { data: inserted, error } = await trackPerf('location.insert', () =>
      supabase
        .from('customer_locations')
        .insert({
          customer_id: customerId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          address,
        })
        .select('id')
        .single(),
    { customerId })

    if (error || !inserted) {
      throw new Error('保存客户当前位置失败，请检查网络后重试')
    }
    return { locationId: inserted.id, address, isNew: true }
  } finally {
    perfLog('location.resolveVisitLocation', startedAt, { customerId, coordinateSource })
  }
}

export async function attachVisitLocationToTrackingRecord(
  customerId: string,
  trackingRecordId: string,
): Promise<LocationResult> {
  const startedAt = perfNow()

  try {
    const location = await resolveVisitLocation(customerId)

    const { data: updated, error } = await trackPerf('location.attachTrackingRecord', () =>
      supabase
        .from('tracking_records')
        .update({ location_id: location.locationId })
        .eq('id', trackingRecordId)
        .eq('customer_id', customerId)
        .select('id')
        .maybeSingle(),
    { customerId, trackingRecordId, isNewLocation: location.isNew })

    if (error || !updated) {
      throw new Error('当前位置已获取，但未能关联到本次拜访，请重试')
    }
    return location
  } finally {
    perfLog('location.attachVisitToTrackingRecord', startedAt, { customerId, trackingRecordId })
  }
}

export function openNavigation(latitude: number, longitude: number, label?: string | null) {
  const query = encodeURIComponent(label || `${latitude},${longitude}`)
  const url = Platform.select({
    ios: `http://maps.apple.com/?daddr=${latitude},${longitude}&q=${query}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${query})`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
  })

  if (!url) return
  Linking.openURL(url).catch(() => {
    Alert.alert('无法打开地图', '请确认手机已安装地图或导航应用')
  })
}

export function formatLocationLabel(location: Pick<CustomerLocation, 'address' | 'latitude' | 'longitude'>) {
  const address = location.address?.trim()
  if (address) return address
  return '正在解析地址'
}
