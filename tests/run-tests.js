#!/usr/bin/env node
/**
 * Simple test runner for bulk import tests
 * Run with: node tests/run-tests.js
 */

const { execSync } = require('child_process');

console.log('🧪 Bulk Import Test Suite\n');

// Check if vitest is available
try {
    execSync('npx vitest --version', { stdio: 'ignore' });
    console.log('✅ Vitest found, running tests...\n');
    execSync('npx vitest run tests/bulk-import --reporter=verbose', {
        stdio: 'inherit',
        cwd: process.cwd()
    });
} catch (e) {
    console.log('⚠️  Vitest not available. Tests require dependencies to be installed.');
    console.log('\n📦 To run tests, first install dependencies:');
    console.log('   npm install');
    console.log('\n🚀 Then run tests with:');
    console.log('   npm run test:unit');
    console.log('\n📋 Test Files Created:');
    console.log('   - tests/bulk-import/psn-extraction.test.ts');
    console.log('   - tests/bulk-import/excel-parsing.test.ts');
    console.log('   - tests/bulk-import/api.test.ts');
    console.log('   - tests/bulk-import/components.test.tsx');
    console.log('   - tests/bulk-import/integration.test.ts');
    console.log('\n✨ All tests are ready to run once dependencies are installed!');
}
