package com.zatcrm.androidlocationmanager

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class AndroidLocationManagerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AndroidLocationManager")

    AsyncFunction("getCurrentPositionAsync") Coroutine {
      highAccuracy: Boolean,
      timeoutMs: Long,
      maximumAgeMs: Long,
      maximumAccuracyMeters: Double,
    ->
      val context = appContext.reactContext
        ?: throw LocationUnavailableException("Android application context is unavailable")
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        ?: throw LocationUnavailableException("Android LocationManager is unavailable")
      val providers = selectProviders(context, manager, highAccuracy)
      if (providers.isEmpty()) {
        throw LocationUnavailableException("No permitted Android location provider is enabled")
      }

      val cached = getBestLastKnownLocation(
        manager,
        providers + LocationManager.PASSIVE_PROVIDER,
        maximumAgeMs,
        maximumAccuracyMeters,
      )
      val location = if (cached != null) {
        cached
      } else {
        withTimeout(timeoutMs) {
          requestCurrentLocation(
            manager,
            providers,
            maximumAgeMs,
            maximumAccuracyMeters,
          )
        }
      }

      mapOf(
        "latitude" to location.latitude,
        "longitude" to location.longitude,
        "accuracy" to location.accuracy.toDouble(),
        "timestamp" to location.time.toDouble(),
        "provider" to location.provider,
      )
    }
  }

  private fun selectProviders(
    context: Context,
    manager: LocationManager,
    highAccuracy: Boolean,
  ): List<String> {
    val fineGranted = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarseGranted = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarseOrFineGranted = coarseGranted || fineGranted

    return manager.getProviders(true)
      .filter { provider ->
        provider != LocationManager.PASSIVE_PROVIDER && when (provider) {
          LocationManager.GPS_PROVIDER -> fineGranted
          else -> coarseOrFineGranted
        }
      }
      .sortedBy { provider ->
        when (provider) {
          LocationManager.GPS_PROVIDER -> if (highAccuracy) 0 else 2
          LocationManager.NETWORK_PROVIDER -> if (highAccuracy) 2 else 0
          else -> 1
        }
      }
      .distinct()
  }

  @SuppressLint("MissingPermission")
  private fun getBestLastKnownLocation(
    manager: LocationManager,
    providers: List<String>,
    maximumAgeMs: Long,
    maximumAccuracyMeters: Double,
  ): Location? = providers
    .distinct()
    .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
    .filter { location -> isUsableLocation(location, maximumAgeMs, maximumAccuracyMeters) }
    .maxByOrNull { location -> location.time }

  private fun isUsableLocation(
    location: Location,
    maximumAgeMs: Long,
    maximumAccuracyMeters: Double,
  ): Boolean {
    val ageMs = System.currentTimeMillis() - location.time
    val isFresh = ageMs in -60_000L..maximumAgeMs
    val isAccurate = !location.hasAccuracy() || location.accuracy <= maximumAccuracyMeters.toFloat()
    return isFresh && isAccurate
  }

  @SuppressLint("MissingPermission")
  private suspend fun requestCurrentLocation(
    manager: LocationManager,
    providers: List<String>,
    maximumAgeMs: Long,
    maximumAccuracyMeters: Double,
  ): Location = suspendCancellableCoroutine { continuation ->
    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        if (!isUsableLocation(location, maximumAgeMs, maximumAccuracyMeters)) return
        runCatching { manager.removeUpdates(this) }
        if (continuation.isActive) continuation.resume(location)
      }
    }

    continuation.invokeOnCancellation { runCatching { manager.removeUpdates(listener) } }

    var registeredProviderCount = 0
    var lastError: Throwable? = null
    providers.forEach { provider ->
      try {
        manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
        registeredProviderCount += 1
      } catch (error: Throwable) {
        lastError = error
      }
    }

    if (registeredProviderCount == 0 && continuation.isActive) {
      runCatching { manager.removeUpdates(listener) }
      continuation.resumeWithException(
        lastError?.let { error -> LocationUnavailableException(error) }
          ?: LocationUnavailableException("Android rejected all location providers"),
      )
    }
  }
}

private class LocationUnavailableException : CodedException {
  constructor(message: String) : super(message)
  constructor(cause: Throwable) : super("Android system location request failed", cause)
}
