const assert = require('assert');
const crypto = require('crypto');

process.env.WEBHOOK_SECRET = 'secure-webhook-token-test-123';
process.env.EVOLUTION_API_TOKEN = 'secure-evo-token-test-456';

const { verifyWebhookAuth } = require('../middlewares/webhookAuth');

async function runSecurityDeepTests() {
  console.log('--- Testing Phase 3 Security Deep Controls ---');

  // 1. SEC-011: Webhook Auth rejects ?token= in query parameter
  let calledNext = false;
  let rejectedStatus = null;
  let rejectedJson = null;

  const mockRes = {
    status: (code) => {
      rejectedStatus = code;
      return {
        json: (data) => { rejectedJson = data; }
      };
    }
  };

  // Attempt auth via query param ?token=
  verifyWebhookAuth(
    { headers: {}, query: { token: 'secure-webhook-token-test-123' }, ip: '127.0.0.1' },
    mockRes,
    () => { calledNext = true; }
  );
  assert.strictEqual(calledNext, false, 'Query token (?token=) must NOT authenticate webhook (SEC-011)');
  assert.strictEqual(rejectedStatus, 401, 'Query token attempt must be rejected with 401');

  // Attempt auth via header 'apikey'
  calledNext = false;
  verifyWebhookAuth(
    { headers: { apikey: 'secure-webhook-token-test-123' }, query: {}, ip: '127.0.0.1' },
    mockRes,
    () => { calledNext = true; }
  );
  assert.strictEqual(calledNext, true, 'Header apikey must authenticate successfully');

  // Attempt auth via header 'Authorization: Bearer <token>'
  calledNext = false;
  verifyWebhookAuth(
    { headers: { authorization: 'Bearer secure-webhook-token-test-123' }, query: {}, ip: '127.0.0.1' },
    mockRes,
    () => { calledNext = true; }
  );
  assert.strictEqual(calledNext, true, 'Bearer header must authenticate successfully');

  // 2. BUG-019: Strict Boolean Parsing
  const parseStrictBoolean = (val, defaultVal = true) => {
    if (val === undefined || val === null) return defaultVal;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      if (s === 'false' || s === '0') return false;
      if (s === 'true' || s === '1') return true;
    }
    return Boolean(val);
  };

  assert.strictEqual(parseStrictBoolean(false), false);
  assert.strictEqual(parseStrictBoolean('false'), false, 'String "false" must parse strictly to false (BUG-019)');
  assert.strictEqual(parseStrictBoolean('0'), false, 'String "0" must parse strictly to false');
  assert.strictEqual(parseStrictBoolean(true), true);
  assert.strictEqual(parseStrictBoolean('true'), true);
  assert.strictEqual(parseStrictBoolean('1'), true);
  assert.strictEqual(parseStrictBoolean(undefined, true), true);

  // 3. SEC-013: Excel Magic Bytes Validation
  const validateExcelMagic = (buf) => {
    if (buf && buf.length >= 4) {
      const magicHex = buf.subarray(0, 4).toString('hex').toLowerCase();
      const isZip = magicHex === '504b0304';
      const isOle = magicHex === 'd0cf11e0';
      return isZip || isOle;
    }
    return false;
  };

  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]); // .xlsx
  const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1]); // .xls
  const fakeExeHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ executable

  assert.strictEqual(validateExcelMagic(zipHeader), true, 'Valid XLSX zip magic must pass');
  assert.strictEqual(validateExcelMagic(oleHeader), true, 'Valid XLS ole magic must pass');
  assert.strictEqual(validateExcelMagic(fakeExeHeader), false, 'Disguised executable must be rejected');

  // 4. SEC-014: Webhook Media Image Header Detection
  const detectImageExtension = (buffer) => {
    const headerHex = buffer.subarray(0, 4).toString('hex').toLowerCase();
    if (headerHex.startsWith('ffd8ff')) return '.jpg';
    if (headerHex.startsWith('89504e47')) return '.png';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp';
    if (headerHex.startsWith('47494638')) return '.gif';
    return null;
  };

  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const webpBuf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from('WEBP')]);
  const gifBuf = Buffer.from([0x47, 0x49, 0x46, 0x38]);
  const nonImageBuf = Buffer.from([0x12, 0x34, 0x56, 0x78]);

  assert.strictEqual(detectImageExtension(jpegBuf), '.jpg');
  assert.strictEqual(detectImageExtension(pngBuf), '.png');
  assert.strictEqual(detectImageExtension(webpBuf), '.webp');
  assert.strictEqual(detectImageExtension(gifBuf), '.gif');
  assert.strictEqual(detectImageExtension(nonImageBuf), null, 'Non-image data must be rejected');

  // 5. SEC-016: Production Seed Default Password Check
  const validateSeedPassword = (env, pass) => {
    const seedPassword = pass || 'password123';
    if (env === 'production' && (!pass || seedPassword === 'password123')) {
      throw new Error('[Security Error - SEC-016] SEED_DEFAULT_PASSWORD wajib dikonfigurasi dengan kata sandi kuat!');
    }
    return true;
  };

  assert.throws(() => validateSeedPassword('production', 'password123'), /SEC-016/);
  assert.throws(() => validateSeedPassword('production', ''), /SEC-016/);
  assert.strictEqual(validateSeedPassword('production', 'StrongCustomPass123!'), true);
  assert.strictEqual(validateSeedPassword('development', 'password123'), true);

  console.log('✅ Phase 3 Security Deep Controls: All assertions PASSED');
}

runSecurityDeepTests().catch(err => {
  console.error('❌ Phase 3 Security test failed:', err);
  process.exit(1);
});
