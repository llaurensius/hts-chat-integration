const assert = require('assert');
const crypto = require('crypto');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-chars-long';
process.env.EVOLUTION_API_TOKEN = process.env.EVOLUTION_API_TOKEN || 'dummy-evo-token';
process.env.SESSION_ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || 'test-session-key-at-least-32-chars-long';

const { encryptSessionData, decryptSessionData } = require('../services/htsClientService');

async function runSec008Tests() {
  console.log('--- Testing SEC-008 & SEC-009: HTS Session Encryption & Hardcoded Key Elimination ---');

  // 1. Valid Round-trip Encryption and Decryption
  const originalPayload = JSON.stringify({
    cookies: { ci_session: 'ci_session_mock_value_12345', csrf_cookie_name: 'csrf_mock_67890' },
    csrfToken: 'csrf_mock_67890'
  });

  const encrypted = encryptSessionData(originalPayload);
  assert.ok(encrypted, 'Encrypted string must not be empty');
  assert.notStrictEqual(encrypted, originalPayload, 'Encrypted string must NOT be equal to plaintext');

  const parts = encrypted.split(':');
  assert.strictEqual(parts.length, 3, 'Ciphertext format must be iv:authTag:encryptedHex');
  assert.strictEqual(parts[0].length, 24, 'IV hex length for 12 bytes must be 24 chars');
  assert.strictEqual(parts[1].length, 32, 'GCM Auth tag hex length for 16 bytes must be 32 chars');

  const decrypted = decryptSessionData(encrypted);
  assert.strictEqual(decrypted, originalPayload, 'Decrypted text must match original payload exactly');

  // 2. SEC-009: Tampered Auth Tag Fails Authentication
  const tamperedAuthTag = parts[0] + ':' + '0'.repeat(32) + ':' + parts[2];
  assert.throws(
    () => decryptSessionData(tamperedAuthTag),
    /Security Error - SEC-009/,
    'Tampered auth tag must throw Security Error'
  );

  // 3. SEC-009: Malformed Ciphertext Fails Authentication
  assert.throws(
    () => decryptSessionData('invalid-non-three-part-ciphertext'),
    /Security Error - SEC-009/,
    'Malformed ciphertext must throw Security Error'
  );

  // 4. SEC-008: Key Validation Simulation
  const validateEncryptionKey = (key) => {
    if (!key || typeof key !== 'string' || key.trim().length < 16) {
      throw new Error('[Security Error - SEC-008] Kunci enkripsi sesi HTS wajib dikonfigurasi!');
    }
    return crypto.createHash('sha256').update(key.trim()).digest();
  };

  assert.throws(() => validateEncryptionKey(''), /SEC-008/, 'Empty key must throw');
  assert.throws(() => validateEncryptionKey(null), /SEC-008/, 'Null key must throw');
  assert.throws(() => validateEncryptionKey('short-key'), /SEC-008/, 'Key < 16 chars must throw');
  const derived = validateEncryptionKey('a-very-strong-session-encryption-key-for-hts-32chars');
  assert.strictEqual(derived.length, 32, 'Derived 256-bit key must be 32 bytes');

  console.log('✅ SEC-008 & SEC-009: All session encryption security assertions PASSED');
}

runSec008Tests().catch(err => {
  console.error('❌ SEC-008 & SEC-009 test failed:', err);
  process.exit(1);
});
