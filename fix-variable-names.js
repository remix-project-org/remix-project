#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Fix variable names that got corrupted during the class replacement
const variableFixes = {
  'const container mx-auto px-4 = ': 'const container = ',
  'container mx-auto px-4)': 'container)',
  'container mx-auto px-4.': 'container.',
  'container mx-auto px-4,': 'container,',
  'container mx-auto px-4;': 'container;',
  'container mx-auto px-4 ': 'container ',
  'carousel-container mx-auto px-4': 'carousel-container',
  'compiler-container mx-auto px-4': 'compiler-container',
  'nlux-composer-container mx-auto px-4': 'nlux-composer-container'
};

function findFiles(dir) {
  let files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
        files = files.concat(findFiles(fullPath));
      } else if (stat.isFile() && (item.endsWith('.tsx') || item.endsWith('.ts') || item.endsWith('.jsx') || item.endsWith('.js'))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return files;
}

function fixVariableNamesInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    for (const [corrupted, fixed] of Object.entries(variableFixes)) {
      if (content.includes(corrupted)) {
        content = content.replace(new RegExp(corrupted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fixed);
        modified = true;
        console.log(`Fixed variable name in ${filePath}: "${corrupted}" → "${fixed}"`);
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    return modified;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔧 Fixing variable name corruptions...\n');
  
  const targetDirs = [
    './libs',
    './apps'
  ];
  
  let totalFiles = 0;
  let modifiedFiles = 0;
  
  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      const files = findFiles(dir);
      totalFiles += files.length;
      
      for (const file of files) {
        if (fixVariableNamesInFile(file)) {
          modifiedFiles++;
        }
      }
    }
  }
  
  console.log(`\n✅ Fixed ${modifiedFiles} files out of ${totalFiles} total files`);
}

if (require.main === module) {
  main();
}