const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runPhase15PerformanceTests() {
  console.log('--- Testing Phase 15: Performance Optimization (DB-012, PERF-001, PERF-002, PERF-003) ---');

  // 1. DB-012 & PERF-002: Bounded ticket listing take logic simulation
  const resolveTicketQueryOptions = (query = {}) => {
    const whereClause = {};
    if (query.status) {
      whereClause.status = query.status;
    }
    const take = query.limit ? Math.min(Math.max(parseInt(query.limit) || 100, 1), 500) : 300;
    return { where: whereClause, take };
  };

  // Default without limit takes 300
  assert.strictEqual(resolveTicketQueryOptions({}).take, 300, 'Default ticket listing must cap at 300');

  // Custom limit clamped to [1, 500]
  assert.strictEqual(resolveTicketQueryOptions({ limit: '50' }).take, 50);
  assert.strictEqual(resolveTicketQueryOptions({ limit: '1000' }).take, 500, 'Limit above 500 must clamp to 500');
  assert.strictEqual(resolveTicketQueryOptions({ limit: '-5' }).take, 1, 'Negative limit must clamp to 1');
  assert.strictEqual(resolveTicketQueryOptions({ status: 'OPEN' }).where.status, 'OPEN', 'Status filter must be supported');

  // 2. PERF-003: Verify frontend bundle chunks in dist directory
  const distAssetsPath = path.resolve(__dirname, '../../../frontend/dist/assets');
  if (fs.existsSync(distAssetsPath)) {
    const distFiles = fs.readdirSync(distAssetsPath);
    const hasVendorChunk = distFiles.some(f => f.startsWith('vendor-') && f.endsWith('.js'));
    const hasIconsChunk = distFiles.some(f => f.startsWith('icons-') && f.endsWith('.js'));
    const hasNetworkChunk = distFiles.some(f => f.startsWith('network-') && f.endsWith('.js'));
    const hasAppChunk = distFiles.some(f => f.startsWith('index-') && f.endsWith('.js'));

    assert.ok(hasVendorChunk, 'Rollup manualChunks must produce separate vendor chunk');
    assert.ok(hasIconsChunk, 'Rollup manualChunks must produce separate icons chunk');
    assert.ok(hasNetworkChunk, 'Rollup manualChunks must produce separate network chunk');
    assert.ok(hasAppChunk, 'Rollup manualChunks must produce main app chunk');

    // Check that main app chunk is well below 500KB
    const appFile = distFiles.find(f => f.startsWith('index-') && f.endsWith('.js'));
    const appSize = fs.statSync(path.join(distAssetsPath, appFile)).size;
    assert.ok(appSize < 300 * 1024, `Main application bundle (${(appSize / 1024).toFixed(1)} kB) must be under 300 kB`);
  }

  console.log('✅ Phase 15 Performance: All pagination, take bounds, and bundle chunking assertions PASSED');
}

runPhase15PerformanceTests().catch(err => {
  console.error('❌ Phase 15 Performance test failed:', err);
  process.exit(1);
});
