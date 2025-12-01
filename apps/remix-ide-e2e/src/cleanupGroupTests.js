const testFolder = './apps/remix-ide-e2e/src/tests/'
const fs = require('fs')
const path = require('path')

/**
 * This script cleans up orphaned group test files.
 * 
 * Group test files (e.g., editor_group1.test.ts) are automatically generated 
 * from base test files (e.g., editor.test.ts) by buildGroupTests.js.
 * 
 * When a base test file is deleted or renamed, its corresponding group test 
 * files become orphaned and need to be removed. This script:
 * 
 * 1. Scans all test files in the tests/ directory
 * 2. Identifies group test files by the pattern: *_group<N>.(test.ts|flaky.ts|pr.ts)
 * 3. Checks if the parent base test file exists
 * 4. Removes any orphaned group test files
 * 
 * This script runs automatically as part of the build:e2e process to ensure
 * the test directory stays clean.
 * 
 * Examples of group test files and their parents:
 *   - editor_group1.test.ts → editor.test.ts
 *   - terminal_group11.flaky.ts → terminal.test.ts
 *   - matomo-consent_group2.pr.ts → matomo-consent.test.ts
 */

let orphanedCount = 0
let deletedCount = 0

console.log('🔍 Scanning for orphaned group test files...\n')

// Get all files in the test folder
const allFiles = fs.readdirSync(testFolder)

// Separate base tests and group tests
// Group tests can have patterns like:
//   - editor_group1.test.ts (standard)
//   - terminal_group11.flaky.ts (flaky tagged)
//   - matomo-consent_group2.pr.ts (PR tagged)
const groupTestPattern = /_group\d+\.(test\.ts|flaky\.ts|pr\.ts)$/

const groupTests = allFiles.filter(file => groupTestPattern.test(file))
const baseTests = allFiles.filter(file => file.endsWith('.test.ts') && !groupTestPattern.test(file))

console.log(`📊 Found ${baseTests.length} base test files`)
console.log(`📊 Found ${groupTests.length} group test files\n`)

// Check each group test to see if its parent exists
groupTests.forEach(groupFile => {
  // Extract the base filename from the group test
  // Examples:
  //   editor_group1.test.ts -> editor.test.ts
  //   dgit_local_group4.test.ts -> dgit_local.test.ts
  //   terminal_group11.flaky.ts -> terminal.test.ts
  
  let baseFileName = groupFile
    .replace(/_group\d+/, '') // Remove _groupN
    .replace(/\.(flaky|pr)/, '') // Remove .flaky or .pr tag
  
  // Ensure it ends with .test.ts (but don't double up)
  if (!baseFileName.endsWith('.test.ts')) {
    baseFileName = baseFileName.replace(/\.ts$/, '.test.ts')
  }
  
  // Check if the base test file exists
  if (!baseTests.includes(baseFileName)) {
    orphanedCount++
    const groupFilePath = path.join(testFolder, groupFile)
    
    console.log(`❌ Orphaned: ${groupFile}`)
    console.log(`   Missing parent: ${baseFileName}`)
    
    try {
      // Read the file to verify it's a group test before deleting
      const content = fs.readFileSync(groupFilePath, 'utf8')
      const isGroupTest = content.includes('buildGroupTest') || 
                          content.includes('import * as test from')
      
      if (isGroupTest) {
        fs.unlinkSync(groupFilePath)
        deletedCount++
        console.log(`   ✅ Deleted\n`)
      } else {
        console.log(`   ⚠️  Skipped (not a generated group test)\n`)
      }
    } catch (error) {
      console.log(`   ⚠️  Error: ${error.message}\n`)
    }
  }
})

// Summary
console.log('─'.repeat(50))
console.log(`\n📋 Summary:`)
console.log(`   Orphaned group tests found: ${orphanedCount}`)
console.log(`   Files deleted: ${deletedCount}`)

if (deletedCount > 0) {
  console.log(`\n✨ Cleanup completed successfully!`)
} else if (orphanedCount === 0) {
  console.log(`\n✅ No orphaned group tests found. Everything is clean!`)
} else {
  console.log(`\n⚠️  Some orphaned files were not deleted (see warnings above)`)
}

process.exit(0)
