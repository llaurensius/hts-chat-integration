const { spawnSync } = require('child_process');
const path = require('path');

const testScripts = [
  'testSec002.js',
  'testSec003.js',
  'testSec004.js',
  'testSec005.js',
  'testSec007.js',
  'testSec008.js',
  'testSec010.js',
  'testPhase3SecurityDeep.js',
  'testPhase4Ux.js',
  'testPhase6Db.js',
  'testIntegrationReliability.js',
  'testPhase9SlaWorkflow.js',
  'testPhase10DataLifecycle.js',
  'testPhase15Performance.js',
  'testPhase16Observability.js',
  'testE2eAndEdgeCases.js',
  'testFullSystemWorkflowValidation.js',
  'testUatV4.js'
];

console.log(`====================================================`);
console.log(`🚀 Menjalankan ${testScripts.length} Rangkaian Pengujian Otomatis...`);
console.log(`====================================================\n`);

let allPassed = true;

for (const script of testScripts) {
  const scriptPath = path.join(__dirname, script);
  console.log(`▶ Menjalankan: ${script}`);
  const res = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' }
  });
  if (res.status !== 0) {
    console.error(`❌ Gagal pada pengujian: ${script}`);
    allPassed = false;
    break;
  }
  console.log('');
}

if (allPassed) {
  console.log(`====================================================`);
  console.log(`🎉 SELURUH PENGUJIAN OTOMATIS BERHASIL (100% PASS)`);
  console.log(`====================================================`);
  process.exit(0);
} else {
  console.error(`\n❌ Ada pengujian yang gagal.`);
  process.exit(1);
}
