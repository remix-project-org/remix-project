import { formatUnits } from 'ethers'
import type { MonadSpec } from './types'

const MONAD_UNIT_LABELS = new Map([
  ['wei', 'wei'], ['gwei', 'gwei'], ['finney', 'mMON'], ['ether', 'MON']
])

export function monadVmLabel(fork: MonadSpec): string {
  const names: Record<MonadSpec, string> = {
    'monad-eight': 'Eight', 'monad-nine': 'Nine', 'monad-ten': 'Ten', 'monad-next': 'Next'
  }
  return `Monad VM (${names[fork]})`
}

/** The currency of every Monad network: the local VM and its forked states, and connected chains. */
export const MONAD_CURRENCY = { name: 'Monad', symbol: 'MON', decimals: 18 }

/** MON formatting follows the detected native currency, whichever provider reported it. */
export function isMonadCurrency(currency: unknown): boolean {
  return (currency as { symbol?: unknown })?.symbol === MONAD_CURRENCY.symbol
}

/** Keep ethers unit identifiers for conversion; only their displayed names change. */
export function monadUnitLabel(unit: string): string {
  // Wei and gwei remain the names of the 10^-18 and 10^-9 MON denominations.
  return MONAD_UNIT_LABELS.get(unit) ?? unit
}

export function formatMonadValue(wei: string | bigint | number): string {
  return `${formatUnits(wei, 18)} MON`
}
