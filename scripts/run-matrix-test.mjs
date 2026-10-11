#!/usr/bin/env node

/**
 * Enterprise Matrix Test Runner for @intuitui-labs/form-builder-engine
 * 
 * Orchestrates multi-version compatibility testing across dedicated fixtures
 * using authentic npm tarball artifacts with ZERO external network downloads.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tarballDir = path.join(rootDir, '.tarball');

const args = process.argv.slice(2);
const isClean = args.includes('--clean');
const targetArg = args.find((a) => a.startsWith('--target='));
const specificTarget = targetArg ? targetArg.split('=')[1] : null;

function log(msg, color = '\x1b[36m') {
  console.log(`${color}${msg}\x1b[0m`);
}

function run(cmd, cwd = rootDir) {
  return execSync(cmd, { cwd, stdio: 'inherit' });
}

function installTarballIntoFixture(tarballPath, fixtureDir) {
  const targetDir = path.join(fixtureDir, 'node_modules', '@intuitui-labs', 'form-builder-engine');
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const tempExtract = path.join(fixtureDir, '.tmp-extract');
  if (fs.existsSync(tempExtract)) fs.rmSync(tempExtract, { recursive: true, force: true });
  fs.mkdirSync(tempExtract, { recursive: true });

  execSync(`tar -xzf "${tarballPath}" -C "${tempExtract}"`, { stdio: 'pipe' });
  const packageDir = path.join(tempExtract, 'package');

  // Copy unpacked package contents into targetDir
  fs.cpSync(packageDir, targetDir, { recursive: true });
  fs.rmSync(tempExtract, { recursive: true, force: true });
}

if (isClean) {
  log('🧹 Pruning temporary tarballs and fixture node_modules...', '\x1b[33m');
  if (fs.existsSync(tarballDir)) fs.rmSync(tarballDir, { recursive: true, force: true });
  for (const f of ['expo-57', 'expo-58']) {
    const fNodeModules = path.join(rootDir, 'fixtures', f, 'node_modules');
    if (fs.existsSync(fNodeModules)) fs.rmSync(fNodeModules, { recursive: true, force: true });
  }
  log('✅ Clean complete.', '\x1b[32m');
  process.exit(0);
}

log('🚀 Starting Enterprise Matrix Testing Pipeline...\n', '\x1b[35m');

// 1. Build root package
log('📦 Step 1: Building root engine TypeScript artifacts...');
run('tsc -p tsconfig.json', rootDir);

// 2. Pack tarball into .tarball/
log('\n📦 Step 2: Packaging authentic .tgz artifact via pnpm pack...');
if (!fs.existsSync(tarballDir)) {
  fs.mkdirSync(tarballDir, { recursive: true });
} else {
  for (const f of fs.readdirSync(tarballDir)) {
    fs.rmSync(path.join(tarballDir, f), { force: true });
  }
}

const safeDest = tarballDir.replace(/\\/g, '/');
execSync(`pnpm pack --pack-destination "${safeDest}"`, { cwd: rootDir, stdio: 'pipe' });
const tarballFiles = fs.readdirSync(tarballDir).filter((f) => f.endsWith('.tgz'));
if (tarballFiles.length === 0) {
  console.error('\x1b[31m❌ Error: No tarball was generated.\x1b[0m');
  process.exit(1);
}
const tarballPath = path.join(tarballDir, tarballFiles[0]);
log(`   Packaged: ${tarballFiles[0]} (${Math.round(fs.statSync(tarballPath).size / 1024)} KB)`, '\x1b[32m');

// 3. Define matrix fixtures
const fixtures = [
  { id: '57', name: 'Expo SDK 57 (RN 0.86 / React 19.2)', dir: path.join(rootDir, 'fixtures', 'expo-57') },
  { id: '58', name: 'Expo SDK 58 (RN 0.88 / React 19.3)', dir: path.join(rootDir, 'fixtures', 'expo-58') },
].filter((f) => !specificTarget || f.id === specificTarget);

if (fixtures.length === 0) {
  console.error(`\x1b[31m❌ Unknown target: ${specificTarget}\x1b[0m`);
  process.exit(1);
}

// 4. Install packed tarball and execute tests
const results = [];

for (const fixture of fixtures) {
  log(`\n🧪 Step 3: Installing tarball & testing Fixture [${fixture.name}]...`, '\x1b[34m');
  const startTime = Date.now();

  try {
    // Unpack tarball directly into fixture's node_modules/@intuitui-labs/form-builder-engine
    installTarballIntoFixture(tarballPath, fixture.dir);

    // Run smoke test in fixture
    run('node --test tests/*.test.mjs', fixture.dir);
    const duration = Date.now() - startTime;
    results.push({ fixture: fixture.name, status: 'PASSED', duration: `${duration}ms` });
    log(`   ✅ ${fixture.name} passed in ${duration}ms!`, '\x1b[32m');
  } catch (err) {
    const duration = Date.now() - startTime;
    results.push({ fixture: fixture.name, status: 'FAILED', duration: `${duration}ms` });
    log(`   ❌ ${fixture.name} failed!`, '\x1b[31m');
  }
}

// 5. Summary Report
console.log('\n' + '='.repeat(60));
log('📊 MATRIX TEST EXECUTION SUMMARY', '\x1b[1m\x1b[35m');
console.log('='.repeat(60));
console.table(results);

const allPassed = results.every((r) => r.status === 'PASSED');
if (!allPassed) {
  process.exit(1);
} else {
  log('🎉 All matrix fixtures verified successfully!\n', '\x1b[32m');
}
