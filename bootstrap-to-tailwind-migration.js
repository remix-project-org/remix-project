#!/usr/bin/env node

/**
 * Bootstrap to Tailwind CSS Migration Script for Remix Project
 * Systematically replaces Bootstrap classes with Tailwind equivalents
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Bootstrap to Tailwind class mappings
const classMappings = {
  // Flexbox Layout
  'd-flex': 'flex',
  'd-inline-flex': 'inline-flex',
  'd-none': 'hidden',
  'd-block': 'block',
  'd-inline': 'inline',
  'd-inline-block': 'inline-block',
  
  'flex-row': 'flex-row',
  'flex-row-reverse': 'flex-row-reverse', 
  'flex-column': 'flex-col',
  'flex-column-reverse': 'flex-col-reverse',
  'flex-wrap': 'flex-wrap',
  'flex-nowrap': 'flex-nowrap',
  'flex-fill': 'flex-1',
  
  // Alignment
  'align-items-start': 'items-start',
  'align-items-center': 'items-center',
  'align-items-end': 'items-end',
  'align-items-baseline': 'items-baseline',
  'align-items-stretch': 'items-stretch',
  
  'justify-content-start': 'justify-start',
  'justify-content-center': 'justify-center', 
  'justify-content-end': 'justify-end',
  'justify-content-between': 'justify-between',
  'justify-content-around': 'justify-around',
  'justify-content-evenly': 'justify-evenly',
  
  'align-self-start': 'self-start',
  'align-self-center': 'self-center',
  'align-self-end': 'self-end',
  'align-self-baseline': 'self-baseline',
  'align-self-stretch': 'self-stretch',
  
  // Spacing (Bootstrap 5 pattern)
  // Margin
  'm-0': 'm-0', 'm-1': 'm-1', 'm-2': 'm-2', 'm-3': 'm-3', 'm-4': 'm-4', 'm-5': 'm-5',
  'mx-0': 'mx-0', 'mx-1': 'mx-1', 'mx-2': 'mx-2', 'mx-3': 'mx-3', 'mx-4': 'mx-4', 'mx-5': 'mx-5',
  'my-0': 'my-0', 'my-1': 'my-1', 'my-2': 'my-2', 'my-3': 'my-3', 'my-4': 'my-4', 'my-5': 'my-5',
  'mt-0': 'mt-0', 'mt-1': 'mt-1', 'mt-2': 'mt-2', 'mt-3': 'mt-3', 'mt-4': 'mt-4', 'mt-5': 'mt-5',
  'mb-0': 'mb-0', 'mb-1': 'mb-1', 'mb-2': 'mb-2', 'mb-3': 'mb-3', 'mb-4': 'mb-4', 'mb-5': 'mb-5',
  'ms-0': 'ml-0', 'ms-1': 'ml-1', 'ms-2': 'ml-2', 'ms-3': 'ml-3', 'ms-4': 'ml-4', 'ms-5': 'ml-5',
  'me-0': 'mr-0', 'me-1': 'mr-1', 'me-2': 'mr-2', 'me-3': 'mr-3', 'me-4': 'mr-4', 'me-5': 'mr-5',
  
  // Padding  
  'p-0': 'p-0', 'p-1': 'p-1', 'p-2': 'p-2', 'p-3': 'p-3', 'p-4': 'p-4', 'p-5': 'p-5',
  'px-0': 'px-0', 'px-1': 'px-1', 'px-2': 'px-2', 'px-3': 'px-3', 'px-4': 'px-4', 'px-5': 'px-5',
  'py-0': 'py-0', 'py-1': 'py-1', 'py-2': 'py-2', 'py-3': 'py-3', 'py-4': 'py-4', 'py-5': 'py-5',
  'pt-0': 'pt-0', 'pt-1': 'pt-1', 'pt-2': 'pt-2', 'pt-3': 'pt-3', 'pt-4': 'pt-4', 'pt-5': 'pt-5',
  'pb-0': 'pb-0', 'pb-1': 'pb-1', 'pb-2': 'pb-2', 'pb-3': 'pb-3', 'pb-4': 'pb-4', 'pb-5': 'pb-5',
  'ps-0': 'pl-0', 'ps-1': 'pl-1', 'ps-2': 'pl-2', 'ps-3': 'pl-3', 'ps-4': 'pl-4', 'ps-5': 'pl-5',
  'pe-0': 'pr-0', 'pe-1': 'pr-1', 'pe-2': 'pr-2', 'pe-3': 'pr-3', 'pe-4': 'pr-4', 'pe-5': 'pr-5',
  
  // Sizing
  'w-25': 'w-1/4', 'w-50': 'w-1/2', 'w-75': 'w-3/4', 'w-100': 'w-full',
  'h-25': 'h-1/4', 'h-50': 'h-1/2', 'h-75': 'h-3/4', 'h-100': 'h-full',
  'mw-100': 'max-w-full', 'mh-100': 'max-h-full',
  'min-vw-100': 'min-w-screen', 'min-vh-100': 'min-h-screen',
  'vw-100': 'w-screen', 'vh-100': 'h-screen',
  
  // Text
  'text-start': 'text-left',
  'text-end': 'text-right', 
  'text-center': 'text-center',
  'text-justify': 'text-justify',
  'text-wrap': 'whitespace-normal',
  'text-nowrap': 'whitespace-nowrap',
  'text-truncate': 'truncate',
  'text-break': 'break-words',
  'text-uppercase': 'uppercase',
  'text-lowercase': 'lowercase', 
  'text-capitalize': 'capitalize',
  'text-decoration-none': 'no-underline',
  'text-decoration-underline': 'underline',
  'text-decoration-line-through': 'line-through',
  
  // Font weights
  'fw-light': 'font-light',
  'fw-normal': 'font-normal', 
  'fw-bold': 'font-bold',
  'fw-bolder': 'font-extrabold',
  'fw-lighter': 'font-light',
  
  // Colors - using our custom Tailwind config
  'text-primary': 'text-primary',
  'text-secondary': 'text-secondary',
  'text-success': 'text-success', 
  'text-danger': 'text-danger',
  'text-warning': 'text-warning',
  'text-info': 'text-info',
  'text-light': 'text-light',
  'text-dark': 'text-dark',
  'text-white': 'text-white',
  'text-muted': 'text-gray-500 dark:text-gray-400',
  
  'bg-primary': 'bg-primary',
  'bg-secondary': 'bg-secondary',
  'bg-success': 'bg-success',
  'bg-danger': 'bg-danger', 
  'bg-warning': 'bg-warning',
  'bg-info': 'bg-info',
  'bg-light': 'bg-light',
  'bg-dark': 'bg-dark',
  'bg-white': 'bg-white',
  'bg-transparent': 'bg-transparent',
  'bg-body': 'bg-body',
  
  // Borders
  'border': 'border',
  'border-0': 'border-0',
  'border-top': 'border-t',
  'border-end': 'border-r', 
  'border-bottom': 'border-b',
  'border-start': 'border-l',
  'border-top-0': 'border-t-0',
  'border-end-0': 'border-r-0',
  'border-bottom-0': 'border-b-0',
  'border-start-0': 'border-l-0',
  
  // Border radius
  'rounded': 'rounded',
  'rounded-0': 'rounded-none',
  'rounded-1': 'rounded-sm',
  'rounded-2': 'rounded',
  'rounded-3': 'rounded-lg',
  'rounded-4': 'rounded-xl',
  'rounded-5': 'rounded-3xl',
  'rounded-circle': 'rounded-full',
  'rounded-pill': 'rounded-full',
  
  // Position
  'position-static': 'static',
  'position-relative': 'relative',
  'position-absolute': 'absolute', 
  'position-fixed': 'fixed',
  'position-sticky': 'sticky',
  
  // Overflow
  'overflow-auto': 'overflow-auto',
  'overflow-hidden': 'overflow-hidden',
  'overflow-visible': 'overflow-visible',
  'overflow-scroll': 'overflow-scroll',
  'overflow-x-auto': 'overflow-x-auto',
  'overflow-x-hidden': 'overflow-x-hidden',
  'overflow-x-scroll': 'overflow-x-scroll',
  'overflow-y-auto': 'overflow-y-auto',
  'overflow-y-hidden': 'overflow-y-hidden',
  'overflow-y-scroll': 'overflow-y-scroll',
  
  // Grid system approximations (convert to flex where reasonable)
  'container': 'container mx-auto px-4',
  'container-fluid': 'w-full px-4',
  'row': 'flex flex-wrap -mx-3',
  'col': 'flex-1 px-3',
  'col-12': 'w-full px-3',
  'col-11': 'w-11/12 px-3',
  'col-10': 'w-10/12 px-3', 
  'col-9': 'w-9/12 px-3',
  'col-8': 'w-8/12 px-3',
  'col-7': 'w-7/12 px-3',
  'col-6': 'w-6/12 px-3',
  'col-5': 'w-5/12 px-3',
  'col-4': 'w-4/12 px-3',
  'col-3': 'w-3/12 px-3',
  'col-2': 'w-2/12 px-3',
  'col-1': 'w-1/12 px-3',
  
  // Responsive columns (simplified)
  'col-sm-12': 'w-full sm:w-full px-3',
  'col-md-12': 'w-full md:w-full px-3',
  'col-lg-12': 'w-full lg:w-full px-3',
  'col-md-6': 'w-full md:w-1/2 px-3',
  'col-lg-6': 'w-full lg:w-1/2 px-3',
  'col-md-4': 'w-full md:w-1/3 px-3',
  'col-lg-4': 'w-full lg:w-1/3 px-3',
  'col-md-8': 'w-full md:w-2/3 px-3',
  'col-lg-8': 'w-full lg:w-2/3 px-3',
  'col-md-3': 'w-full md:w-1/4 px-3',
  'col-lg-3': 'w-full lg:w-1/4 px-3',
  'col-md-9': 'w-full md:w-3/4 px-3',
  'col-lg-9': 'w-full lg:w-3/4 px-3',
};

// Button class mappings (more complex)
const buttonMappings = {
  'btn btn-primary': 'inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors',
  'btn btn-secondary': 'inline-flex items-center px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 transition-colors',
  'btn btn-success': 'inline-flex items-center px-4 py-2 bg-success text-white rounded-md hover:bg-success/90 transition-colors',
  'btn btn-danger': 'inline-flex items-center px-4 py-2 bg-danger text-white rounded-md hover:bg-danger/90 transition-colors',
  'btn btn-warning': 'inline-flex items-center px-4 py-2 bg-warning text-white rounded-md hover:bg-warning/90 transition-colors',
  'btn btn-info': 'inline-flex items-center px-4 py-2 bg-info text-white rounded-md hover:bg-info/90 transition-colors',
  'btn btn-light': 'inline-flex items-center px-4 py-2 bg-light text-dark rounded-md hover:bg-light/90 transition-colors',
  'btn btn-dark': 'inline-flex items-center px-4 py-2 bg-dark text-white rounded-md hover:bg-dark/90 transition-colors',
  
  'btn btn-outline-primary': 'inline-flex items-center px-4 py-2 border border-primary text-primary rounded-md hover:bg-primary hover:text-white transition-colors',
  'btn btn-outline-secondary': 'inline-flex items-center px-4 py-2 border border-secondary text-secondary rounded-md hover:bg-secondary hover:text-white transition-colors',
  
  'btn btn-sm': 'inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors',
  'btn btn-lg': 'inline-flex items-center px-6 py-3 text-lg rounded-md transition-colors',
  
  // Keep specialized buttons as-is for theme compatibility
  'btn-ai': 'btn-ai',
};

// Form control mappings
const formMappings = {
  'form-control': 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent outline-none',
  'form-select': 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent outline-none',
  'form-check': 'flex items-center',
  'form-check-input': 'w-4 h-4 text-primary bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-primary focus:ring-2',
  'form-check-label': 'ml-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer',
};

// Card mappings
const cardMappings = {
  'card': 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm',
  'card-header': 'px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium',
  'card-body': 'p-4',
  'card-footer': 'px-4 py-3 border-t border-gray-200 dark:border-gray-700',
  'card-title': 'text-lg font-medium text-gray-900 dark:text-gray-100',
  'card-text': 'text-gray-700 dark:text-gray-300',
};

// Alert mappings
const alertMappings = {
  'alert': 'p-4 rounded-md border',
  'alert-primary': 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
  'alert-secondary': 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200', 
  'alert-success': 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
  'alert-danger': 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  'alert-warning': 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200',
  'alert-info': 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
};

// Combine all mappings
const allMappings = {
  ...classMappings,
  ...buttonMappings, 
  ...formMappings,
  ...cardMappings,
  ...alertMappings
};

// Function to replace classes in a file
function replaceClassesInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Replace button combinations first (more specific)
    for (const [bootstrap, tailwind] of Object.entries(buttonMappings)) {
      if (content.includes(bootstrap)) {
        const regex = new RegExp(`className=["'][^"']*\\b${bootstrap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^"']*["']`, 'g');
        const newContent = content.replace(regex, (match) => {
          return match.replace(bootstrap, tailwind);
        });
        if (newContent !== content) {
          content = newContent;
          modified = true;
          console.log(`Replaced "${bootstrap}" in ${filePath}`);
        }
      }
    }
    
    // Then replace individual classes
    for (const [bootstrap, tailwind] of Object.entries(classMappings)) {
      if (content.includes(bootstrap)) {
        const regex = new RegExp(`\\b${bootstrap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        const newContent = content.replace(regex, tailwind);
        if (newContent !== content) {
          content = newContent;
          modified = true;
          console.log(`Replaced "${bootstrap}" → "${tailwind}" in ${filePath}`);
        }
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
  console.log('🚀 Starting Bootstrap to Tailwind CSS migration...\n');
  
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
        if (replaceClassesInFile(file)) {
          modifiedFiles++;
        }
      }
      console.log(`   ✅ Processed ${files.length} files\n`);
    } else {
      console.log(`   ⚠️  Directory not found: ${dir}`);
    }
  }
  
  console.log('\n🎉 Migration completed!');
  console.log(`📊 Total files processed: ${totalFiles}`);
  console.log(`✏️  Files modified: ${modifiedFiles}`);
  console.log(`🔄 Files unchanged: ${totalFiles - modifiedFiles}`);
}

if (require.main === module) {
  main();
}

module.exports = { allMappings, replaceClassesInFile, findFiles };