import * as ExpoLocation from 'expo-location'
import * as Linking from 'expo-linking'
import { Alert, Platform } from 'react-native'
import { perfLog, perfNow, trackPerf } from './perf'
import { supabase } from './supabase'
import type { CustomerLocation } from '../types/database'

const DEDUP_METERS = 300

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

export async function getCurrentCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const loc = await trackPerf('location.currentPosition', () =>
      ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High }))
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
  } catch {
    return null
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const [result] = await trackPerf('location.reverseGeocode', () =>
      ExpoLocation.reverseGeocodeAsync({ latitude: lat, longitude: lon }))
    if (!result) return null
    return [result.region, result.city, result.district, result.street, result.streetNumber]
      .filter(Boolean)
      .join('')
      || result.formattedAddress
      || null
  } catch {
    return null
  }
}

export type LocationResult =
  | { locationId: string; address: string | null; isNew: boolean }
  | null

export async function resolveVisitLocation(customerId: string): Promise<LocationResult> {
  const startedAt = perfNow()

  try {
    const granted = await requestLocationPermission()
    if (!granted) return null

    const coords = await getCurrentCoords()
    if (!coords) return null

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
    perfLog('location.resolveVisitLocation', startedAt, { customerId })
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
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
}
