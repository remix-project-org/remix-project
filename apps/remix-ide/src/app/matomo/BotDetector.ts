/**
 * BotDetector - Comprehensive bot and automation detection utility
 *
 * Detects various types of bots including:
 * - Search engine crawlers (Google, Bing, etc.)
 * - Social media bots (Facebook, Twitter, etc.)
 * - Monitoring services (UptimeRobot, Pingdom, etc.)
 * - Headless browsers (Puppeteer, Playwright, Selenium)
 * - AI scrapers (ChatGPT, Claude, etc.)
 *
 * Detection methods:
 * 1. User Agent string analysis
 * 2. Browser automation flags (navigator.webdriver)
 * 3. Headless browser detection
 * 4. Missing browser features
 * 5. Behavioral signals
 * 6. Mouse movement analysis
 */

export interface BotDetectionResult {
  isBot: boolean;
  botType?: string;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  userAgent: string;
  mouseAnalysis?: MouseBehaviorAnalysis;
}

export interface MouseBehaviorAnalysis {
  hasMoved: boolean;
  movements: number;
  averageSpeed: number;
  maxSpeed: number;
  hasAcceleration: boolean;
  hasCurvedPath: boolean;
  suspiciousPatterns: string[];
  humanLikelihood: 'high' | 'medium' | 'low' | 'unknown';
}

// ================== MOUSE TRACKING CLASS ==================

/**
 * MouseTracker - Analyzes mouse movement patterns to detect bots
 *
 * Tracks:
 * - Movement frequency and speed
 * - Acceleration/deceleration patterns
 * - Path curvature (humans rarely move in straight lines)
 * - Micro-movements and jitter (humans have natural hand tremor)
 * - Click patterns (timing, position accuracy)
 */
class MouseTracker {
  private movements: Array<{ x: number; y: number; timestamp: number }> = [];
  private clicks: Array<{ x: number; y: number; timestamp: number }> = [];
  private lastPosition: { x: number; y: number } | null = null;
  private startTime: number = Date.now();
  private isTracking: boolean = false;

  private readonly MAX_MOVEMENTS = 100; // Keep last 100 movements
  private readonly SAMPLING_INTERVAL = 50; // Sample every 50ms

  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private mouseClickHandler: ((e: MouseEvent) => void) | null = null;

  /**
   * Start tracking mouse movements
   */
  start(): void {
    if (this.isTracking) return;

    this.mouseMoveHandler = (e: MouseEvent) => {
      const now = Date.now();

      // Throttle to sampling interval
      const lastMovement = this.movements[this.movements.length - 1];
      if (lastMovement && now - lastMovement.timestamp < this.SAMPLING_INTERVAL) {
        return;
      }

      this.movements.push({
        x: e.clientX,
        y: e.clientY,
        timestamp: now,
      });

      // Keep only recent movements
      if (this.movements.length > this.MAX_MOVEMENTS) {
        this.movements.shift();
      }

      this.lastPosition = { x: e.clientX, y: e.clientY };
    };

    this.mouseClickHandler = (e: MouseEvent) => {
      this.clicks.push({
        x: e.clientX,
        y: e.clientY,
        timestamp: Date.now(),
      });

      // Keep only recent clicks
      if (this.clicks.length > 20) {
        this.clicks.shift();
      }
    };

    document.addEventListener('mousemove', this.mouseMoveHandler, { passive: true });
    document.addEventListener('click', this.mouseClickHandler, { passive: true });
    this.isTracking = true;
  }

  /**
   * Stop tracking and clean up
   */
  stop(): void {
    if (!this.isTracking) return;

    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
    }
    if (this.mouseClickHandler) {
      document.removeEventListener('click', this.mouseClickHandler);
    }

    this.isTracking = false;
  }

  /**
   * Analyze collected mouse data
   */
  analyze(): MouseBehaviorAnalysis {
    const suspiciousPatterns: string[] = [];
    let humanLikelihood: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';

    // Not enough data yet - return early
    if (this.movements.length < 5) {
      return {
        hasMoved: this.movements.length > 0,
        movements: this.movements.length,
        averageSpeed: 0,
        maxSpeed: 0,
        hasAcceleration: false,
        hasCurvedPath: false,
        suspiciousPatterns: [],
        humanLikelihood: 'unknown',
      };
    }

    // Calculate speeds (optimized single pass)
    const speeds: number[] = [];
    let totalSpeed = 0;
    let maxSpeed = 0;

    for (let i = 1; i < this.movements.length; i++) {
      const prev = this.movements[i - 1];
      const curr = this.movements[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const time = (curr.timestamp - prev.timestamp) / 1000;
      const speed = time > 0 ? distance / time : 0;

      speeds.push(speed);
      totalSpeed += speed;
      if (speed > maxSpeed) maxSpeed = speed;
    }

    const averageSpeed = totalSpeed / speeds.length;

    // Check for acceleration/deceleration
    let hasAcceleration = false;
    let accelerationChanges = 0;
    const threshold = averageSpeed * 0.3;

    for (let i = 1; i < speeds.length; i++) {
      if (Math.abs(speeds[i] - speeds[i - 1]) > threshold) {
        accelerationChanges++;
      }
    }
    hasAcceleration = accelerationChanges > speeds.length * 0.2;

    // Check for curved paths (humans rarely move in straight lines)
    let hasCurvedPath = false;
    if (this.movements.length >= 10) {
      const angles: number[] = [];
      for (let i = 2; i < this.movements.length; i++) {
        const p1 = this.movements[i - 2];
        const p2 = this.movements[i - 1];
        const p3 = this.movements[i];

        const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
        const angleDiff = Math.abs(angle2 - angle1);
        angles.push(angleDiff);
      }

      const averageAngleChange = angles.reduce((a, b) => a + b, 0) / angles.length;
      hasCurvedPath = averageAngleChange > 0.1; // More than 5.7 degrees average change
    }

    // Detect suspicious patterns

    // 1. Perfectly straight lines (bot characteristic)
    if (!hasCurvedPath && this.movements.length >= 10) {
      suspiciousPatterns.push('perfectly-straight-movements');
    }

    // 2. Constant speed (bots don't accelerate naturally)
    if (!hasAcceleration && speeds.length >= 10) {
      const speedVariance = speeds.reduce((sum, speed) => sum + Math.pow(speed - averageSpeed, 2), 0) / speeds.length;
      if (speedVariance < averageSpeed * 0.1) {
        suspiciousPatterns.push('constant-speed');
      }
    }

    // 3. Extremely fast movements (teleporting)
    if (maxSpeed > 5000) {
      // More than 5000 px/s is suspicious
      suspiciousPatterns.push('unrealistic-speed');
    }

    // 4. No mouse movement at all (headless browser)
    if (this.movements.length === 0 && Date.now() - this.startTime > 5000) {
      suspiciousPatterns.push('no-mouse-activity');
    }

    // 5. Robotic click patterns (perfectly timed clicks)
    if (this.clicks.length >= 3) {
      const clickIntervals: number[] = [];
      for (let i = 1; i < this.clicks.length; i++) {
        clickIntervals.push(this.clicks[i].timestamp - this.clicks[i - 1].timestamp);
      }

      // Check if clicks are too evenly spaced (bot pattern)
      const avgInterval = clickIntervals.reduce((a, b) => a + b, 0) / clickIntervals.length;
      const intervalVariance = clickIntervals.reduce((sum, interval) =>
        sum + Math.pow(interval - avgInterval, 2), 0) / clickIntervals.length;

      if (intervalVariance < 100) {
        // Less than 100ms² variance = too consistent
        suspiciousPatterns.push('robotic-click-timing');
      }
    }

    // 6. Grid-aligned movements (bot snapping to pixel grid)
    if (this.movements.length >= 20) {
      let gridAligned = 0;
      for (const movement of this.movements) {
        if (movement.x % 10 === 0 && movement.y % 10 === 0) {
          gridAligned++;
        }
      }
      if (gridAligned > this.movements.length * 0.5) {
        suspiciousPatterns.push('grid-aligned-movements');
      }
    }

    // Calculate human likelihood
    if (suspiciousPatterns.length === 0 && hasAcceleration && hasCurvedPath) {
      humanLikelihood = 'high';
    } else if (suspiciousPatterns.length <= 1 && (hasAcceleration || hasCurvedPath)) {
      humanLikelihood = 'medium';
    } else if (suspiciousPatterns.length >= 2) {
      humanLikelihood = 'low';
    }

    return {
      hasMoved: this.movements.length > 0,
      movements: this.movements.length,
      averageSpeed,
      maxSpeed,
      hasAcceleration,
      hasCurvedPath,
      suspiciousPatterns,
      humanLikelihood,
    };
  }
}

// ================== BOT DETECTOR CLASS ==================

export class BotDetector {
  // Mouse tracking state
  private static mouseTracker: MouseTracker | null = null;

  // Common bot patterns in user agents
  private static readonly BOT_PATTERNS = [
    // Search engine crawlers
    /googlebot/i,
    /bingbot/i,
    /slurp/i, // Yahoo
    /duckduckbot/i,
    /baiduspider/i,
    /yandexbot/i,
    /sogou/i,
    /exabot/i,

    // Social media bots
    /facebookexternalhit/i,
    /twitterbot/i,
    /linkedinbot/i,
    /pinterest/i,
    /whatsapp/i,
    /telegrambot/i,

    // Monitoring services
    /uptimerobot/i,
    /pingdom/i,
    /newrelic/i,
    /gtmetrix/i,
    /lighthouse/i,

    // SEO tools
    /ahrefsbot/i,
    /semrushbot/i,
    /mj12bot/i,
    /dotbot/i,
    /screaming frog/i,

    // AI scrapers
    /chatgpt-user/i,
    /gptbot/i,
    /claudebot/i,
    /anthropic-ai/i,
    /cohere-ai/i,
    /perplexity/i,

    // Generic bot indicators
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /go-http-client/i,
    /axios/i,

    // Headless browsers
    /headlesschrome/i,
    /phantomjs/i,
    /htmlunit/i,
    /splashhttp/i,
  ];

  // Automation frameworks
  private static readonly AUTOMATION_PATTERNS = [
    /puppeteer/i,
    /playwright/i,
    /selenium/i,
    /webdriver/i,
    /chromedriver/i,
    /geckodriver/i,
    /automation/i,
  ];

  /**
   * Perform comprehensive bot detection
   * @param includeMouseTracking - Whether to include mouse behavior analysis (default: true)
   */
  static detect(includeMouseTracking: boolean = true): BotDetectionResult {
    const userAgent = navigator.userAgent;
    const reasons: string[] = [];
    let isBot = false;
    let botType: string | undefined;
    let confidence: 'high' | 'medium' | 'low' = 'low';

    // Check 1: User agent pattern matching
    const uaCheck = this.checkUserAgent(userAgent);
    if (uaCheck.isBot) {
      isBot = true;
      botType = uaCheck.botType;
      confidence = 'high';
      reasons.push(`User agent matches bot pattern: ${uaCheck.botType}`);
    }

    // Check 2: Automation flags (very reliable)
    if (this.checkAutomationFlags()) {
      isBot = true;
      botType = botType || 'automation';
      confidence = 'high';
      reasons.push('Browser automation detected (navigator.webdriver or similar)');
    }

    // Check 3: Headless browser detection
    const headlessCheck = this.checkHeadlessBrowser();
    if (headlessCheck.isHeadless) {
      isBot = true;
      botType = botType || 'headless';
      confidence = confidence === 'low' ? 'medium' : confidence;
      reasons.push(...headlessCheck.reasons);
    }

    // Check 4: Missing features (medium confidence)
    const missingFeatures = this.checkMissingFeatures();
    if (missingFeatures.length > 0) {
      if (missingFeatures.length >= 3) {
        isBot = true;
        botType = botType || 'suspicious';
        confidence = confidence === 'low' ? 'medium' : confidence;
      }
      reasons.push(`Missing browser features: ${missingFeatures.join(', ')}`);
    }

    // Check 5: Behavioral signals (low confidence, just log)
    const behavioralSignals = this.checkBehavioralSignals();
    if (behavioralSignals.length > 0) {
      reasons.push(`Behavioral signals: ${behavioralSignals.join(', ')}`);
    }

    // Check 6: Mouse behavior analysis (if enabled and tracker initialized)
    let mouseAnalysis: MouseBehaviorAnalysis | undefined;
    if (includeMouseTracking) {
      if (!this.mouseTracker) {
        // Initialize mouse tracking on first detection
        this.mouseTracker = new MouseTracker();
        this.mouseTracker.start();
      }

      mouseAnalysis = this.mouseTracker.analyze();

      // Adjust bot detection based on mouse behavior
      if (mouseAnalysis.hasMoved && mouseAnalysis.humanLikelihood === 'high') {
        // Strong evidence of human behavior
        if (confidence === 'low') {
          reasons.push('Mouse behavior indicates human user');
        }
      } else if (mouseAnalysis.suspiciousPatterns.length > 0) {
        // Suspicious mouse patterns suggest bot
        if (!isBot && mouseAnalysis.suspiciousPatterns.length >= 2) {
          isBot = true;
          botType = botType || 'suspicious-mouse-behavior';
          confidence = 'medium';
        }
        reasons.push(`Suspicious mouse patterns: ${mouseAnalysis.suspiciousPatterns.join(', ')}`);
      }
    }

    return {
      isBot,
      botType,
      confidence,
      reasons,
      userAgent,
      mouseAnalysis,
    };
  }

  /**
   * Check user agent string for known bot patterns
   */
  private static checkUserAgent(userAgent: string): { isBot: boolean; botType?: string } {
    // Check bot patterns
    for (const pattern of this.BOT_PATTERNS) {
      if (pattern.test(userAgent)) {
        const match = userAgent.match(pattern);
        return {
          isBot: true,
          botType: match ? match[0].toLowerCase() : 'unknown-bot',
        };
      }
    }

    // Check automation patterns
    for (const pattern of this.AUTOMATION_PATTERNS) {
      if (pattern.test(userAgent)) {
        const match = userAgent.match(pattern);
        return {
          isBot: true,
          botType: match ? `automation-${match[0].toLowerCase()}` : 'automation',
        };
      }
    }

    return { isBot: false };
  }

  /**
   * Check for browser automation flags
   */
  private static checkAutomationFlags(): boolean {
    // Most reliable indicator - WebDriver flag
    if (navigator.webdriver) {
      return true;
    }

    // Check for Selenium/WebDriver artifacts
    if ((window as any).__webdriver_evaluate ||
        (window as any).__selenium_evaluate ||
        (window as any).__webdriver_script_function ||
        (window as any).__webdriver_script_func ||
        (window as any).__selenium_unwrapped ||
        (window as any).__fxdriver_evaluate ||
        (window as any).__driver_unwrapped ||
        (window as any).__webdriver_unwrapped ||
        (window as any).__driver_evaluate ||
        (window as any).__fxdriver_unwrapped) {
      return true;
    }

    // Check document properties
    if ((document as any).__webdriver_evaluate ||
        (document as any).__selenium_evaluate ||
        (document as any).__webdriver_unwrapped ||
        (document as any).__driver_unwrapped) {
      return true;
    }

    // Check for common automation framework artifacts
    if ((window as any)._phantom ||
        (window as any).callPhantom ||
        (window as any)._Selenium_IDE_Recorder) {
      return true;
    }

    return false;
  }

  /**
   * Detect headless browser
   */
  private static checkHeadlessBrowser(): { isHeadless: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let isHeadless = false;

    // Check for headless Chrome/Chromium
    if (navigator.userAgent.includes('HeadlessChrome')) {
      isHeadless = true;
      reasons.push('HeadlessChrome in user agent');
    }

    // Chrome headless has no plugins
    if (navigator.plugins?.length === 0 && /Chrome/.test(navigator.userAgent)) {
      isHeadless = true;
      reasons.push('No plugins in Chrome (headless indicator)');
    }

    // Check for missing webGL vendor
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const vendor = (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

          // Headless browsers often have 'SwiftShader' or generic renderers
          if (vendor?.includes('Google') && renderer?.includes('SwiftShader')) {
            isHeadless = true;
            reasons.push('SwiftShader renderer (headless indicator)');
          }
        }
      }
    } catch (e) {
      // Ignore errors
    }

    // Check chrome object in window (present in headless)
    if ((window as any).chrome && !(window as any).chrome.runtime) {
      reasons.push('Incomplete chrome object');
    }

    // Check permissions API
    try {
      if (navigator.permissions) {
        navigator.permissions.query({ name: 'notifications' as PermissionName }).then((result) => {
          if (result.state === 'denied' && !('Notification' in window)) {
            reasons.push('Permissions API mismatch');
          }
        }).catch(() => {});
      }
    } catch (e) {
      // Ignore errors
    }

    return { isHeadless, reasons };
  }

  /**
   * Check for missing browser features that real users typically have
   */
  private static checkMissingFeatures(): string[] {
    const missing: string[] = [];

    // Check for basic browser features
    if (typeof navigator.languages === 'undefined' || navigator.languages.length === 0) {
      missing.push('languages');
    }

    if (typeof navigator.platform === 'undefined') {
      missing.push('platform');
    }

    if (typeof navigator.plugins === 'undefined') {
      missing.push('plugins');
    }

    if (typeof navigator.mimeTypes === 'undefined') {
      missing.push('mimeTypes');
    }

    // Check for touch support (many bots don't emulate this properly)
    const isMobileUA = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!('ontouchstart' in window) &&
        !('maxTouchPoints' in navigator) &&
        isMobileUA) {
      missing.push('touch-support-mobile');
    }

    // Check for connection API
    if (!('connection' in navigator) && !('mozConnection' in navigator) && !('webkitConnection' in navigator)) {
      missing.push('connection-api');
    }

    return missing;
  }

  /**
   * Check behavioral signals (patterns that suggest automated behavior)
   */
  private static checkBehavioralSignals(): string[] {
    const signals: string[] = [];

    // Check screen dimensions (some bots have weird screen sizes)
    if (screen.width === 0 || screen.height === 0) {
      signals.push('zero-screen-dimensions');
    }

    // Check for very small viewport (unusual for real users)
    if (window.innerWidth < 100 || window.innerHeight < 100) {
      signals.push('tiny-viewport');
    }

    // Check for suspiciously fast page load (some bots don't wait for DOMContentLoaded properly)
    if (document.readyState === 'loading' && performance.now() < 100) {
      signals.push('very-fast-load');
    }

    // Check for missing referer on non-direct navigation
    if (!document.referrer && window.history.length > 1) {
      signals.push('missing-referrer');
    }

    return signals;
  }

  /**
   * Quick check - just returns boolean without full analysis
   */
  static isBot(): boolean {
    return this.detect().isBot;
  }

  /**
   * Get a simple string representation of bot type for Matomo dimension
   */
  static getBotTypeString(): string {
    const result = this.detect();
    if (!result.isBot) {
      return 'human';
    }
    return result.botType || 'unknown-bot';
  }

  /**
   * Get confidence level of detection
   */
  static getConfidence(): 'high' | 'medium' | 'low' {
    return this.detect().confidence;
  }

  /**
   * Start mouse tracking (if not already started)
   */
  static startMouseTracking(): void {
    if (!this.mouseTracker) {
      this.mouseTracker = new MouseTracker();
      this.mouseTracker.start();
    }
  }

  /**
   * Stop mouse tracking and clean up
   */
  static stopMouseTracking(): void {
    if (this.mouseTracker) {
      this.mouseTracker.stop();
      this.mouseTracker = null;
    }
  }

  /**
   * Get current mouse behavior analysis
   */
  static getMouseAnalysis(): MouseBehaviorAnalysis | null {
    return this.mouseTracker?.analyze() || null;
  }
}
