import type { MonadSpec } from './types'

export const MONAD_FORKS: readonly MonadSpec[] = ['monad-eight', 'monad-nine', 'monad-ten', 'monad-next']

export function isMonadSpec(fork: unknown): fork is MonadSpec {
  return MONAD_FORKS.some(spec => spec === fork)
}
