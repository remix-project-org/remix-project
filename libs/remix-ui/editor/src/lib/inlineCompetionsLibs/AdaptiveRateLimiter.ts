/**
 * Adaptive Rate Limiter for Inline Completions
 *
 */

interface CompletionHistoryEntry {
  timestamp: number;
  accepted: boolean;
}

interface AdaptiveRateLimiterOptions {
  minRequestInterval?: number;
  completionCooldown?: number;
  historyWindow?: number;
  baseAdaptiveCooldown?: number;
  maxAdaptiveCooldown?: number;
}

interface AdaptiveRateLimiterStats {
  acceptanceRate: number;
  totalCompletions: number;
  acceptedCompletions: number;
  rejectedCompletions: number;
  currentCooldown: number;
}

export class AdaptiveRateLimiter {
  private lastRequestTime: number = 0;
  private lastCompletionTime: number = 0;
  private acceptanceRate: number = 0.5;
  private totalCompletions: number = 0;
  private acceptedCompletions: number = 0;
  private rejectedCompletions: number = 0;
  private recentCompletionHistory: CompletionHistoryEntry[] = [];

  private readonly minRequestInterval: number = 500;
  private readonly completionCooldown: number = 2000;
  private readonly historyWindow: number = 300000; // 5 minutes
  private readonly baseAdaptiveCooldown: number = 1000;
  private readonly maxAdaptiveCooldown: number = 10000;

  constructor(options?: AdaptiveRateLimiterOptions) {
    if (options) {
      this.minRequestInterval = options.minRequestInterval ?? this.minRequestInterval;
      this.completionCooldown = options.completionCooldown ?? this.completionCooldown;
      this.historyWindow = options.historyWindow ?? this.historyWindow;
      this.baseAdaptiveCooldown = options.baseAdaptiveCooldown ?? this.baseAdaptiveCooldown;
      this.maxAdaptiveCooldown = options.maxAdaptiveCooldown ?? this.maxAdaptiveCooldown;
    }
  }

  shouldAllowRequest(currentTime: number = Date.now()): boolean {
    const timeSinceLastRequest = currentTime - this.lastRequestTime;
    const timeSinceLastCompletion = currentTime - this.lastCompletionTime;
    const adaptiveCooldown = this.getAdaptiveCooldown();

    const minIntervalCheck = timeSinceLastRequest < this.minRequestInterval;
    const adaptiveCooldownCheck = timeSinceLastCompletion < adaptiveCooldown;

    if (minIntervalCheck) {
      return false;
    }

    if (adaptiveCooldownCheck) {
      return false;
    }

    return true;
  }

  recordRequest(currentTime: number = Date.now()): void {
    // console.log('[AdaptiveRateLimiter] Recording request at:', currentTime);
    this.lastRequestTime = currentTime;
  }

  recordCompletion(currentTime: number = Date.now()): void {
    // console.log('[AdaptiveRateLimiter] Recording completion at:', currentTime);
    this.lastCompletionTime = currentTime;
  }

  trackCompletionShown(): void {
    this.totalCompletions++;
    this.recentCompletionHistory.push({
      timestamp: Date.now(),
      accepted: false
    });
  }

  trackCompletionAccepted(): void {
    this.acceptedCompletions++;

    // Update the most recent completion as accepted
    if (this.recentCompletionHistory.length > 0) {
      this.recentCompletionHistory[this.recentCompletionHistory.length - 1].accepted = true;
    }
  }

  trackCompletionRejected(): void {
    this.rejectedCompletions++;
  }

  private getAdaptiveCooldown(): number {
    this.updateAcceptanceRate();
    // high fidelity adoption
    // Higher acceptance rate = shorter cooldown, lower acceptance rate = longer cooldown
    const adaptiveFactor = Math.max(0.1, 1 - this.acceptanceRate);
    const adaptiveCooldown = Math.min(
      this.maxAdaptiveCooldown,
      this.baseAdaptiveCooldown + (this.baseAdaptiveCooldown * adaptiveFactor * 5)
    );

    return Math.max(this.completionCooldown, adaptiveCooldown);
  }

  private updateAcceptanceRate(): void {
    const currentTime = Date.now();
    const oldHistoryLength = this.recentCompletionHistory.length;

    // Remove old entries beyond the history window
    this.recentCompletionHistory = this.recentCompletionHistory.filter(
      entry => currentTime - entry.timestamp < this.historyWindow
    );

    // Calculate acceptance rate from recent history
    if (this.recentCompletionHistory.length > 0) {
      const recentAccepted = this.recentCompletionHistory.filter(entry => entry.accepted).length;
      this.acceptanceRate = recentAccepted / this.recentCompletionHistory.length;
    } else {
      // Default to 0.5 if no recent history
      // do not penalize anyone at startup
      this.acceptanceRate = 0.5;
    }
  }

  getStats(): AdaptiveRateLimiterStats {
    return {
      acceptanceRate: this.acceptanceRate,
      totalCompletions: this.totalCompletions,
      acceptedCompletions: this.acceptedCompletions,
      rejectedCompletions: this.rejectedCompletions,
      currentCooldown: this.getAdaptiveCooldown()
    };
  }
}