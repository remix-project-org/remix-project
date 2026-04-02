#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Fix all corrupted imports and file references
const importFixes = {
  // Import statement fixes
  "import { Container } from './components/container mx-auto px-4'": "import { Container } from './components/container'",
  "import { CompilerContainer } from './compiler-container mx-auto px-4'": "import { CompilerContainer } from './compiler-container'",
  "import ActionNotificationContainer from './action-notification-container mx-auto px-4'": "import ActionNotificationContainer from './action-notification-container'",
  
  // File path corruptions in imports
  './components/container mx-auto px-4': './components/container',
  './compiler-container mx-auto px-4': './compiler-container',
  './action-notification-container mx-auto px-4': './action-notification-container',
  
  // Class name corruptions that need special handling
  'container mx-auto px-4={': 'container={',
  'carousel-container mx-auto px-4': 'carousel-container',
  'compiler-container mx-auto px-4': 'compiler-container',
  'nlux-composer-container mx-auto px-4': 'nlux-composer-container',
  
  // Fix CSS class names that got corrupted
  'remixui_scrollable-container mx-auto px-4': 'remixui_scrollable-container',
  'remixui_default-icons-container mx-auto px-4': 'remixui_default-icons-container',
  'remix_ui-carousel-container mx-auto px-4': 'remix_ui-carousel-container',
  'opcodes-container mx-auto px-4': 'opcodes-container',
  
  // Fix any remaining container references
  'const container mx-auto px-4 =': 'const container =',
  'container mx-auto px-4)': 'container)',
  'container mx-auto px-4.': 'container.',
  'container mx-auto px-4,': 'container,',
  'container mx-auto px-4;': 'container;',
  'container mx-auto px-4 ': 'container ',
  
  // Fix DOM class references that got corrupted
  "getElementsByClassName('nlux-composer-container mx-auto px-4')": "getElementsByClassName('nlux-composer-container')",
  "'container mx-auto px-4'": "'container'",
  '"container mx-auto px-4"': '"container"',
  
  // Fix any remaining double corruptions
  'container mx-auto px-4 mx-auto px-4': 'container',
  'carousel-container mx-auto px-4 mx-auto px-4': 'carousel-container'
};

function findAllFiles(dir) {
  let files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git') && !item.includes('dist')) {
        files = files.concat(findAllFiles(fullPath));
      } else if (stat.isFile() && (item.endsWith('.tsx') || item.endsWith('.ts') || item.endsWith('.jsx') || item.endsWith('.js') || item.endsWith('.css'))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return files;
}

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    const originalContent = content;
    
    for (const [corrupted, fixed] of Object.entries(importFixes)) {
      if (content.includes(corrupted)) {
        content = content.replace(new RegExp(corrupted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fixed);
        modified = true;
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed corruptions in: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔧 Comprehensive fix for import and container corruptions...\n');
  
  const targetDirs = [
    './libs',
    './apps'
  ];
  
  let totalFiles = 0;
  let fixedFiles = 0;
  
  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      console.log(`📁 Processing: ${dir}`);
      const files = findAllFiles(dir);
      totalFiles += files.length;
      
      for (const file of files) {
        if (fixFile(file)) {
          fixedFiles++;
        }
      }
    }
  }
  
  console.log(`\n✅ Comprehensive fix completed!`);
  console.log(`📊 Files processed: ${totalFiles}`);
  console.log(`🔧 Files fixed: ${fixedFiles}`);
}

if (require.main === module) {
  main();
}