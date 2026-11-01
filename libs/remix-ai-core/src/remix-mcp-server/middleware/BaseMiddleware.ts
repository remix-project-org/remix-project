/**
 * Base Middleware class with shared utilities
 *
 * This base class provides common functionality used by both SecurityMiddleware
 * and ValidationMiddleware to eliminate code duplication.
 */

import { MCPConfigManager } from '../config/MCPConfigManager';

export abstract class BaseMiddleware {
  protected configManager?: MCPConfigManager;

  constructor(configManager?: MCPConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Match a string against a pattern (supports wildcards)
   * Shared between SecurityMiddleware and ValidationMiddleware
   *
   * Pattern syntax:
   * - * matches any characters except /
   * - ** matches any characters including /
   * - ? matches a single character
   *
   * @example
   * matchPattern('src/file.ts', 'src/*.ts') // true
   * matchPattern('src/sub/file.ts', 'src/**\/*.ts') // true
   * matchPattern('test.js', 'test.?s') // true
   */
  protected matchPattern(str: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      // First escape all regex metacharacters, including backslash
      .replace(/[\\^$+?.()|[\]{}]/g, '\\$&')
      // Temporarily mark escaped ** so we can distinguish it from single *
      .replace(/\\\*\\\*/g, '___DOUBLESTAR___')
      // * matches anything except /
      .replace(/\\\*/g, '[^/]*')
      // ** matches anything including /
      .replace(/___DOUBLESTAR___/g, '.*')
      // ? matches a single character
      .replace(/\\\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }

  /**
   * Check if a value is likely code content (to avoid false positives in validation)
   * Code content should not trigger injection warnings for patterns like require(), eval(), etc.
   *
   * This helps differentiate between:
   * - Malicious input: eval(userInput) in a parameter
   * - Legitimate code: 'function test() { eval("x"); }' in file content
   */
  protected isLikelyCodeContent(value: string): boolean {
    // Check for common code patterns that indicate this is actual source code
    const codeIndicators = [
      /^pragma solidity/, // Solidity contract
      /^\/\*[\s\S]*\*\//, // Block comment at start
      /^\/\//, // Line comment at start
      /function\s+\w+\s*\(/, // Function declarations
      /contract\s+\w+/, // Contract declarations
      /import\s+.*from/, // Import statements
      /\n\s*function\s+/, // Function on new line
      /\n\s*contract\s+/, // Contract on new line
    ];

    // If it contains multiple code indicators, it's likely source code
    const matchCount = codeIndicators.filter(pattern => pattern.test(value)).length;
    return matchCount >= 2 || value.length > 500; // Long content is likely code
  }

  /**
   * Check if a string contains potentially dangerous patterns
   * Returns the pattern that matched, or null if safe
   *
   * IMPORTANT: This should only be used for user inputs, not for file content
   * that might legitimately contain these patterns as code.
   */
  protected findDangerousPattern(value: string, context: 'input' | 'code' = 'input'): RegExp | null {
    // If this is code content, be much more lenient
    if (context === 'code' || this.isLikelyCodeContent(value)) {
      // Only check for actual command injection patterns in code
      const severePatterns = [
        /;\s*rm\s+-rf\s+\//, // Dangerous rm commands
        /&&\s*rm\s+-rf\s+\//, // Chained dangerous commands
        /\|\s*rm\s+-rf\s+\//, // Piped dangerous commands
      ];

      for (const pattern of severePatterns) {
        if (pattern.test(value)) return pattern;
      }
      return null;
    }

    // For user inputs, be more strict
    const dangerousPatterns = [
      /;\s*rm\s/, // rm commands
      /&&\s*rm\s/, // Chained rm
      /\|\s*rm\s/, // Piped rm
      />\s*\/dev\//, // Redirect to devices
      /curl\s.*\|/, // Piped curl (potential malware download)
      /wget\s.*\|/, // Piped wget (potential malware download)
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(value)) return pattern;
    }

    return null;
  }
}
