/**
 * Shared ENS name validation logic.
 * Used by DeployPanel and BaseAppWizard to enforce consistent rules.
 *
 * @returns Error message string, or '' if valid.
 */
export function validateEnsName(name: string): string {
  if (!name) return '';
  if (name.length < 3) return 'Name must be at least 3 characters.';
  if (!/^[a-z0-9-]+$/.test(name)) return 'Only lowercase letters, numbers, and hyphens are allowed.';
  if (name.startsWith('-') || name.endsWith('-')) return 'Name cannot start or end with a hyphen.';
  if (name.includes('--')) return 'Name cannot contain consecutive hyphens.';
  return '';
}

/**
 * Parse ENS registration error messages from the backend/contract
 * and return user-friendly messages.
 */
export function parseEnsRegistrationError(error: any): string {
  // Combine all possible error fields for detection
  const msg = error?.message || '';
  const details = error?.details || '';
  const combined = `${msg} ${details}`;

  // Contract revert: "Subdomain already owned by another address"
  if (combined.includes('already owned')) {
    return 'This subdomain is already owned by a different wallet address. Please choose a different name.';
  }

  // User rejected wallet request
  if (combined.includes('user rejected') || combined.includes('User denied')) {
    return 'Wallet request was rejected.';
  }

  // Server config error
  if (combined.includes('Server configuration error')) {
    return 'ENS registration service is currently unavailable. Please try again later.';
  }

  // Extract clean reason from ethers revert errors
  const reasonMatch = combined.match(/reason="([^"]+)"/);
  if (reasonMatch) {
    return `Registration failed: ${reasonMatch[1]}`;
  }

  // Generic server error — don't show raw details
  if (msg.includes('Failed to register ENS domain')) {
    return 'Registration failed. Please try again later.';
  }

  // Fallback — show message only (not details which may contain hex data)
  return msg || 'An unexpected error occurred.';
}
