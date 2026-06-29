export class InactivityTimeoutManager {
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private readonly timeoutMs: number
  private readonly onTimeout: () => void

  constructor(timeoutMs: number, onTimeout: () => void) {
    this.timeoutMs = timeoutMs
    this.onTimeout = onTimeout
  }

  reset(): void {
    this.clear()
    this.timeoutId = setTimeout(() => {
      this.onTimeout()
    }, this.timeoutMs)
  }

  clear(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  isActive(): boolean {
    return this.timeoutId !== null
  }
}
