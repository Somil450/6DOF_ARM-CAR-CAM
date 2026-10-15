/**
 * WAREBOT - Frontend & PWA Verification Test Suite
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('========================================');
console.log('   WAREBOT FRONTEND & PWA TEST SUITE    ');
console.log('========================================\n');

// 1. Verify index.html in dist
const indexHtmlPath = path.join(distDir, 'index.html');
assert(fs.existsSync(indexHtmlPath), 'dist/index.html exists');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');
assert(indexHtmlContent.includes('manifest.webmanifest'), 'index.html contains manifest link');
assert(indexHtmlContent.includes('serviceWorker.register'), 'index.html registers service worker');
assert(indexHtmlContent.includes('theme-color'), 'index.html defines theme-color');
assert(indexHtmlContent.includes('#000000'), 'index.html defines pure black theme-color (#000000)');

// 2. Verify PWA Manifest
const manifestPath = path.join(distDir, 'manifest.webmanifest');
assert(fs.existsSync(manifestPath), 'dist/manifest.webmanifest exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
assert(manifest.name === 'WAREBOT Robotics Control Platform', 'Manifest name is correct');
assert(manifest.short_name === 'WAREBOT', 'Manifest short_name is correct');
assert(manifest.display === 'standalone', 'Manifest display mode is standalone');
assert(manifest.background_color === '#000000', 'Manifest background_color is #000000');
assert(manifest.theme_color === '#000000', 'Manifest theme_color is #000000');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Manifest contains icon definitions');

// 3. Verify Icons
assert(fs.existsSync(path.join(distDir, 'icon-192.png')), 'dist/icon-192.png exists');
assert(fs.existsSync(path.join(distDir, 'icon-512.png')), 'dist/icon-512.png exists');
assert(fs.existsSync(path.join(distDir, 'favicon.svg')), 'dist/favicon.svg exists');

// 4. Verify Service Worker
const swPath = path.join(distDir, 'sw.js');
assert(fs.existsSync(swPath), 'dist/sw.js exists');
const swContent = fs.readFileSync(swPath, 'utf-8');
assert(swContent.includes('addEventListener(\'install\''), 'sw.js handles install event');
assert(swContent.includes('addEventListener(\'fetch\''), 'sw.js handles fetch event');
assert(swContent.includes('/api/camera/stream'), 'sw.js bypasses camera proxy streaming');

// 5. Verify Build Assets
const assetsDir = path.join(distDir, 'assets');
assert(fs.existsSync(assetsDir), 'dist/assets directory exists');
const assetFiles = fs.readdirSync(assetsDir);
const jsBundle = assetFiles.find(f => f.endsWith('.js'));
const cssBundle = assetFiles.find(f => f.endsWith('.css'));
assert(Boolean(jsBundle), `JavaScript bundle found: ${jsBundle}`);
assert(Boolean(cssBundle), `CSS bundle found: ${cssBundle}`);

console.log('\n========================================');
console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('========================================');

if (failed > 0) {
  process.exit(1);
}
