type PerfDetails = Record<string, unknown>

const enabled = process.env.EXPO_PUBLIC_ENABLE_PERF_LOGS !== 'false'

export function perfNow() {
  return globalThis.performance?.now?.() ?? Date.now()
}

export function perfLog(label: string, startedAt: number, details?: PerfDetails) {
  if (!enabled) return

  const durationMs = Math.round(perfNow() - startedAt)
  const detailText = details ? ` ${JSON.stringify(details)}` : ''
  console.info(`[CRM PERF] ${label} ${durationMs}ms${detailText}`)
}

export async function trackPerf<T>(
  label: string,
  action: () => PromiseLike<T>,
  details?: PerfDetails,
): Promise<T> {
  const startedAt = perfNow()

  try {
    const result = await action()
    perfLog(label, startedAt, details)
    return result
  } catch (error) {
    perfLog(`${label}.failed`, startedAt, {
      ...details,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
