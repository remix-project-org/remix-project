/**
 * Core Matomo Event Types and Interfaces
 * 
 * This file contains the base types and interfaces used throughout the Matomo event system.
 */

export interface MatomoEventBase {
  name?: string;
  value?: string | number;
  isClick?: boolean; // Pre-defined by event builders - distinguishes click events from other interactions
}

// Note: The MatomoEvent union type will be built up by importing from individual event files
// in the main index.ts file to avoid circular dependencies