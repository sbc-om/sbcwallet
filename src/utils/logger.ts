const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  process.env.VITEST === '1'

const isDebugEnabled = /^(1|true|yes)$/i.test(process.env.SBCWALLET_DEBUG || '')

export function logDebug(...args: unknown[]) {
  if (!isDebugEnabled) return
  console.log(...args)
}

export function logInfo(...args: unknown[]) {
  if (!isDebugEnabled) return
  console.log(...args)
}

export function logWarn(...args: unknown[]) {
  if (isTestEnv && !isDebugEnabled) return
  console.warn(...args)
}

export function logError(...args: unknown[]) {
  if (isTestEnv && !isDebugEnabled) return
  console.error(...args)
}
