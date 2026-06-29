#!/usr/bin/env node

/**
 * Post-build script to inject E2E test configuration into the HTML
 * This prevents environment variables from being baked into webpack bundles
 * and allows the same cache to be used for production and test builds.
 * 
 * Usage:
 *   node scripts/inject-e2e-config.js <dist-path> <bin-url> <wasm-url> <npm-url>
 * 
 * Example:
 *   node scripts/inject-e2e-config.js dist/apps/remix-ide \
 *     "http://127.0.0.1:8080/assets/js/soljson" \
 *     "http://127.0.0.1:8080/assets/js/soljson" \
 *     "http://127.0.0.1:9090/"
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length < 4) {
  console.error('Usage: inject-e2e-config.js <dist-path> <bin-url> <wasm-url> <npm-url>');
  process.exit(1);
}

const [distPath, binUrl, wasmUrl, npmUrl] = args;
const indexHtmlPath = path.join(distPath, 'index.html');

if (!fs.existsSync(indexHtmlPath)) {
  console.error(`Error: index.html not found at ${indexHtmlPath}`);
  process.exit(1);
}

// Read the HTML file
let html = fs.readFileSync(indexHtmlPath, 'utf8');

// Create the configuration script
const configScript = `
	<!-- E2E Test Configuration - Injected by scripts/inject-e2e-config.js -->
	<script>
		window.__REMIX_COMPILER_URLS__ = {
			binURL: '${binUrl}',
			wasmURL: '${wasmUrl}'
		};
    window.__IS_E2E_TEST__ = true;
	</script>
`;

// Inject before </head>
if (!html.includes('window.__REMIX_COMPILER_URLS__')) {
  html = html.replace('</head>', `${configScript}</head>`);
  
  // Write back to file
  fs.writeFileSync(indexHtmlPath, html, 'utf8');
  
  console.log(`✅ E2E configuration injected into ${indexHtmlPath}`);
  console.log(`   binURL: ${binUrl}`);
  console.log(`   wasmURL: ${wasmUrl}`);
  console.log(`   npmURL: ${npmUrl}`);
} else {
  console.log(`⚠️  E2E configuration already exists in ${indexHtmlPath}, skipping...`);
}
