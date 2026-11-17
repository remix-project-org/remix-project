import { formatUnits } from 'ethers'
import { isMonadSpec } from './forks'
import type { MonadSpec } from './types'

export function monadVmLabel(fork: MonadSpec): string {
  const names: Record<MonadSpec, string> = {
    'monad-eight': 'Eight', 'monad-nine': 'Nine', 'monad-ten': 'Ten', 'monad-next': 'Next'
  }
  return `Monad VM (${names[fork]})`
}

export function isMonadProvider(provider: unknown): boolean {
  return typeof provider === 'string' && provider.startsWith('vm-') && isMonadSpec(provider.slice(3))
}

/** Keep ethers unit identifiers for conversion; only their displayed names change. */
export function monadUnitLabel(unit: string): string {
  return unit === 'ether' ? 'MON' : unit === 'finney' ? 'mMON' : unit
}

export function formatMonadValue(wei: string | bigint | number): string {
  return `${formatUnits(wei, 18)} MON`
}
