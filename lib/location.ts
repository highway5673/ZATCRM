import * as ExpoLocation from 'expo-location'
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
  const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function getCurrentCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High })
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
  } catch {
    return null
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const [result] = await ExpoLocation.reverseGeocodeAsync({ latitude: lat, longitude: lon })
    if (!result) return null
    return [result.district, result.street, result.streetNumber]
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
  const granted = await requestLocationPermission()
  if (!granted) return null

  const coords = await getCurrentCoords()
  if (!coords) return null

  const { data: existing } = await supabase
    .from('customer_locations')
    .select('*')
    .eq('customer_id', customerId)

  const nearby = (existing ?? []).find(
    (loc: CustomerLocation) =>
      haversineMeters(coords.latitude, coords.longitude, loc.latitude, loc.longitude) <= DEDUP_METERS,
  )

  if (nearby) {
    return { locationId: nearby.id, address: nearby.address, isNew: false }
  }

  const address = await reverseGeocode(coords.latitude, coords.longitude)

  const { data: inserted, error } = await supabase
    .from('customer_locations')
    .insert({
      customer_id: customerId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      address,
    })
    .select('id')
    .single()

  if (error || !inserted) return null
  return { locationId: inserted.id, address, isNew: true }
}
