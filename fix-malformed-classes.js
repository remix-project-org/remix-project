#!/usr/bin/env node

/**
 * Fix malformed class replacements from Bootstrap to Tailwind migration
 */

const fs = require('fs');
const path = require('path');

// Fix malformed class patterns
const fixMappings = {
  'flex-flex-1 px-3': 'flex-col',
  'flex-flex flex-wrap -mx-3': 'flex-row',
  'flex-flex flex-wrap -mx-3-reverse': 'flex-row-reverse',
  'md:flex-1 px-3-span': 'md:col-span',
  'flex-1 px-3-span': 'col-span',
  'container mx-auto px-4 mx-auto px-4': 'container',
  'compiler-container mx-auto px-4': 'compiler-container',
  'nlux-composer-container mx-auto px-4': 'nlux-composer-container',
  'remixui_scrollable-container mx-auto px-4': 'remixui_scrollable-container',
  'remixui_default-icons-container mx-auto px-4': 'remixui_default-icons-container',
  'carousel-container mx-auto px-4': 'carousel-container',
  'opcodes-container mx-auto px-4': 'opcodes-container',
  'remix_ui-carousel-container mx-auto px-4': 'remix_ui-carousel-container',
  
  // Fix parameter names that got corrupted
  'flex flex-wrap -mx-3': 'row',
  'flex-1 px-3': 'col'
};

// Function to replace malformed classes in a file
function fixMalformedClassesInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    for (const [malformed, correct] of Object.entries(fixMappings)) {
      if (content.includes(malformed)) {
        const newContent = content.replace(new RegExp(malformed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct);
        if (newContent !== content) {
          content = newContent;
          modified = true;
          console.log(`Fixed "${malformed}" → "${correct}" in ${filePath}`);
        }
      }
    }
    
    // Fix parameter corruption in function signatures
    if (content.includes('flex flex-wrap -mx-3:')) {
      const newContent = content.replace(/flex flex-wrap -mx-3:/g, 'row:');
      if (newContent !== content) {
        content = newContent;
        modified = true;
        console.log(`Fixed parameter name "flex flex-wrap -mx-3:" → "row:" in ${filePath}`);
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Function to find all relevant files
function findFiles(dir, extensions = ['.tsx', '.jsx', '.ts', '.js']) {
  let files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
        files = files.concat(findFiles(fullPath, extensions));
      } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return files;
}

// Main execution
function main() {
  console.log('🔧 Fixing malformed class replacements...\n');
  
  const targetDirs = [
    './libs/remix-ui',
    './apps/remix-ide/src',
    './apps/contract-verification/src', 
    './apps/vyper/src',
    './apps/circuit-compiler/src',
    './apps/doc-gen/src',
    './apps/quick-dapp/src',
    './apps/remix-dapp/src',
  ];
  
  let totalFiles = 0;
  let modifiedFiles = 0;
  
  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      console.log(`📁 Processing directory: ${dir}`);
      const files = findFiles(dir);
      totalFiles += files.length;
      
      for (const file of files) {
        if (fixMalformedClassesInFile(file)) {
          modifiedFiles++;
        }
      }
      console.log(`   ✅ Processed ${files.length} files\n`);
    }
  }
  
  console.log('\n🎉 Cleanup completed!');
  console.log(`📊 Total files processed: ${totalFiles}`);
  console.log(`✏️  Files fixed: ${modifiedFiles}`);
}

if (require.main === module) {
  main();
}