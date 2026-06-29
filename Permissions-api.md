# Add Permissions API Service for feature access control

## Summary
Introduces a new `PermissionsApiService` to query user feature permissions from the backend, enabling fine-grained access control for features like AI models, storage limits, and wallet capabilities.

## Changes

### New API Service (`libs/remix-api/src/lib/plugins/api-services.ts`)
- Added `PermissionsApiService` class with methods:
  - `getPermissions()` - Get all user permissions
  - `checkFeature(feature)` - Check single feature access
  - `checkFeatures(features)` - Batch check multiple features
  - `getFeaturesInCategory(category)` - Get features by category
  - `hasFeature(feature)` - Simple boolean helper
  - `getFeatureLimit(feature)` - Get limit value/unit for a feature

### New Types (`libs/remix-api/src/lib/plugins/api-types.ts`)
- Added `Permission`, `PermissionsResponse`, `FeatureCheckResponse`, `MultiFeatureCheckResponse`, `CategoryFeaturesResponse`

### AuthPlugin Integration (`apps/remix-ide/src/app/plugins/auth-plugin.tsx`)
- Exposed permission methods to other plugins:
  - `checkPermission(feature)` - Check feature with limits
  - `hasPermission(feature)` - Simple boolean check
  - `getAllPermissions()` - Get all user permissions
  - `checkPermissions(features)` - Batch check
  - `getFeaturesByCategory(category)` - Category-based queries
  - `getFeatureLimit(feature)` - Get limits only

### Refactoring
- Added `setToken()` method to all API service classes for proper encapsulation (removes `as any` casts)
- Added permissions endpoint URL to `@remix-endpoints-helper`

## Usage Examples

```typescript
// Simple boolean check - is feature allowed?
const canUseGPT4 = await call('auth', 'hasPermission', 'ai:gpt-4')
if (!canUseGPT4) {
  showUpgradeModal('GPT-4 requires a Pro subscription')
}

// Check with limit info
const storage = await call('auth', 'checkPermission', 'storage:workspace')
if (storage.allowed) {
  console.log(`Storage allowed: ${storage.limit} ${storage.unit}`) // e.g., "500 MB"
}

// Get just the limit for a feature
const { limit, unit } = await call('auth', 'getFeatureLimit', 'ai:monthly-requests')
console.log(`You have ${limit} ${unit} remaining`) // e.g., "1000 requests"

// Batch check multiple features at once (single API call)
const permissions = await call('auth', 'checkPermissions', [
  'ai:gpt-4',
  'ai:claude',
  'wallet:mainnet',
  'storage:5gb'
])
// Returns: { 'ai:gpt-4': { allowed: true }, 'ai:claude': { allowed: false }, ... }

// Get all AI-related features
const aiFeatures = await call('auth', 'getFeaturesByCategory', 'ai')
// Returns: [{ feature_name: 'ai:gpt-4', allowed: true, limit_value: 100, limit_unit: 'requests' }, ...]

// Get all permissions for current user (useful for settings/profile page)
const allPermissions = await call('auth', 'getAllPermissions')
allPermissions.forEach(p => {
  console.log(`${p.feature_name}: ${p.allowed ? '✓' : '✗'}`)
})
```

## Real-world integration example

```typescript
// In an AI plugin
async handleUserPrompt(prompt: string, model: string) {
  // Check if user can use this model
  const { allowed, limit, unit } = await this.call('auth', 'checkPermission', `ai:${model}`)
  
  if (!allowed) {
    throw new Error(`${model} is not available on your plan. Please upgrade.`)
  }
  
  if (limit !== undefined) {
    const usage = await this.getMonthlyUsage()
    if (usage >= limit) {
      throw new Error(`You've reached your ${limit} ${unit} limit for ${model}.`)
    }
  }
  
  // Proceed with API call...
}
```
