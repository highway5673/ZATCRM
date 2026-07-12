import * as ExpoLocation from 'expo-location'
import * as Linking from 'expo-linking'
import { Alert, Platform } from 'react-native'
import { perfLog, perfNow, trackPerf } from './perf'
import { supabase } from './supabase'
import type { CustomerLocation } from '../types/database'

const DEDUP_METERS = 300
const GEOCODE_TIMEOUT_MS = 8000
const LOCATION_FIX_TIMEOUT_MS = 5000

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

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await trackPerf('location.permission', () =>
    ExpoLocation.requestForegroundPermissionsAsync())
  return status === 'granted'
}

type CurrentCoords = {
  latitude: number
  longitude: number
  source: 'lastKnown' | 'current'
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

export async function getCurrentCoords(): Promise<CurrentCoords | null> {
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

  try {
    const loc = await trackPerf('location.currentPosition', () =>
      withTimeout(
        ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High }),
        LOCATION_FIX_TIMEOUT_MS,
        '定位超时',
      ))
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, source: 'current' }
  } catch {
    return null
  }
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
  | { locationId: string; address: string | null; isNew: boolean }
  | null

export async function resolveVisitLocation(customerId: string): Promise<LocationResult> {
  const startedAt = perfNow()
  let coordinateSource: CurrentCoords['source'] | null = null

  try {
    const granted = await requestLocationPermission()
    if (!granted) return null

    const coords = await getCurrentCoords()
    if (!coords) return null
    coordinateSource = coords.source

    const { data: existing } = await trackPerf('location.lookupExisting', () =>
      supabase
        .from('customer_locations')
        .select('*')
        .eq('customer_id', customerId),
    { customerId })

    const nearby = (existing ?? []).find(
      (loc: CustomerLocation) =>
        haversineMeters(coords.latitude, coords.longitude, loc.latitude, loc.longitude) <= DEDUP_METERS,
    )

    if (nearby) {
      return { locationId: nearby.id, address: nearby.address, isNew: false }
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

    if (error || !inserted) return null
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
    if (!location) return null

    const { error } = await trackPerf('location.attachTrackingRecord', () =>
      supabase
        .from('tracking_records')
        .update({ location_id: location.locationId })
        .eq('id', trackingRecordId),
    { customerId, trackingRecordId, isNewLocation: location.isNew })

    if (error) throw error
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
