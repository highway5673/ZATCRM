package com.zatcrm.androidlocationmanager

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
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

    AsyncFunction("getCurrentPositionAsync") Coroutine { highAccuracy: Boolean, timeoutMs: Long, maximumAgeMs: Long ->
      val context = appContext.reactContext
        ?: throw LocationUnavailableException("Android application context is unavailable")
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        ?: throw LocationUnavailableException("Android LocationManager is unavailable")
      val provider = selectProvider(context, manager, highAccuracy)
        ?: throw LocationUnavailableException("No permitted Android location provider is enabled")

      val cached = getLastKnownLocation(manager, provider)
      val location = if (cached != null && System.currentTimeMillis() - cached.time <= maximumAgeMs) {
        cached
      } else {
        withTimeout(timeoutMs) {
          requestCurrentLocation(context, manager, provider)
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

  private fun selectProvider(
    context: Context,
    manager: LocationManager,
    highAccuracy: Boolean,
  ): String? {
    val fineGranted = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarseGranted = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val providers = if (highAccuracy) {
      listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
    } else {
      listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
    }

    return providers.firstOrNull { provider ->
      val permissionGranted = if (provider == LocationManager.GPS_PROVIDER) fineGranted else coarseGranted
      permissionGranted && runCatching { manager.isProviderEnabled(provider) }.getOrDefault(false)
    }
  }

  @SuppressLint("MissingPermission")
  private fun getLastKnownLocation(manager: LocationManager, provider: String): Location? =
    runCatching { manager.getLastKnownLocation(provider) }.getOrNull()

  @SuppressLint("MissingPermission")
  private suspend fun requestCurrentLocation(
    context: Context,
    manager: LocationManager,
    provider: String,
  ): Location = suspendCancellableCoroutine { continuation ->
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val cancellationSignal = CancellationSignal()
      continuation.invokeOnCancellation { cancellationSignal.cancel() }
      try {
        manager.getCurrentLocation(provider, cancellationSignal, context.mainExecutor) { location ->
          if (continuation.isActive) {
            if (location != null) {
              continuation.resume(location)
            } else {
              continuation.resumeWithException(LocationUnavailableException("Android returned no location"))
            }
          }
        }
      } catch (error: Throwable) {
        if (continuation.isActive) continuation.resumeWithException(LocationUnavailableException(error))
      }
      return@suspendCancellableCoroutine
    }

    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        manager.removeUpdates(this)
        if (continuation.isActive) continuation.resume(location)
      }

      override fun onProviderDisabled(disabledProvider: String) {
        if (disabledProvider != provider) return
        manager.removeUpdates(this)
        if (continuation.isActive) {
          continuation.resumeWithException(LocationUnavailableException("Location provider was disabled"))
        }
      }
    }

    continuation.invokeOnCancellation { manager.removeUpdates(listener) }
    try {
      manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
    } catch (error: Throwable) {
      manager.removeUpdates(listener)
      if (continuation.isActive) continuation.resumeWithException(LocationUnavailableException(error))
    }
  }
}

private class LocationUnavailableException : CodedException {
  constructor(message: String) : super(message)
  constructor(cause: Throwable) : super("Android system location request failed", cause)
}
