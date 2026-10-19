const assert = require('assert');
const { redactSensitive, requestIdMiddleware, errorHandler, createHealthHandler } = require('../utils/observability');

async function runObservabilityTests() {
  console.log('--- Testing Phase 16: Observability, Error Handling & Redaction ---');

  // 1. Redaction of sensitive keys
  const sensitivePayload = {
    email: 'admin@helpdesk.go.id',
    password: 'supersecretpassword123',
    nested: {
      token: 'jwt.token.secret.here',
      apiKey: 'xyz123',
      cookie_data: 'ci_session=abc123'
    },
    normalData: 'Ticket summary details'
  };

  const redacted = redactSensitive(sensitivePayload);
  assert.strictEqual(redacted.password, '[REDACTED]', 'Password must be redacted');
  assert.strictEqual(redacted.nested.token, '[REDACTED]', 'Token must be redacted');
  assert.strictEqual(redacted.nested.apiKey, '[REDACTED]', 'API key must be redacted');
  assert.strictEqual(redacted.nested.cookie_data, '[REDACTED]', 'Cookie data must be redacted');
  assert.strictEqual(redacted.normalData, 'Ticket summary details', 'Non-sensitive data must be preserved');

  // 2. Request / Correlation ID Middleware
  const mockReq = { headers: {} };
  let headerSet = {};
  const mockRes = {
    setHeader: (k, v) => { headerSet[k] = v; }
  };
  let nextCalled = false;

  requestIdMiddleware(mockReq, mockRes, () => { nextCalled = true; });
  assert.ok(nextCalled, 'Next must be called');
  assert.ok(mockReq.id, 'Request ID must be assigned to req.id');
  assert.strictEqual(headerSet['X-Request-Id'], mockReq.id, 'Response header X-Request-Id must match req.id');

  // Custom correlation ID passed from upstream proxy
  const mockReqCustom = { headers: { 'x-correlation-id': 'custom-upstream-id-123' } };
  headerSet = {};
  requestIdMiddleware(mockReqCustom, mockRes, () => {});
  assert.strictEqual(mockReqCustom.id, 'custom-upstream-id-123', 'Upstream correlation ID must be preserved');
  assert.strictEqual(headerSet['X-Request-Id'], 'custom-upstream-id-123');

  // 3. Centralized Error Handler - Classification
  const simulateError = (err, isProd = false) => {
    const prevEnv = process.env.NODE_ENV;
    if (isProd) process.env.NODE_ENV = 'production';
    else process.env.NODE_ENV = 'development';

    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { jsonResponse = data; }
        };
      }
    };

    errorHandler(err, { id: 'test-req-id-123', method: 'POST', originalUrl: '/api/test' }, res, () => {});
    process.env.NODE_ENV = prevEnv;
    return { statusCode, jsonResponse };
  };

  // A. Prisma Unique Constraint (P2002) -> 409
  const p2002Err = new Error('Unique constraint failed');
  p2002Err.name = 'PrismaClientKnownRequestError';
  p2002Err.code = 'P2002';
  const resP2002 = simulateError(p2002Err);
  assert.strictEqual(resP2002.statusCode, 409);
  assert.strictEqual(resP2002.jsonResponse.code, 'RESOURCE_ALREADY_EXISTS');
  assert.strictEqual(resP2002.jsonResponse.requestId, 'test-req-id-123');

  // B. Prisma Not Found (P2025) -> 404
  const p2025Err = new Error('Record not found');
  p2025Err.name = 'PrismaClientKnownRequestError';
  p2025Err.code = 'P2025';
  const resP2025 = simulateError(p2025Err);
  assert.strictEqual(resP2025.statusCode, 404);
  assert.strictEqual(resP2025.jsonResponse.code, 'RESOURCE_NOT_FOUND');

  // C. Multer File Limit -> 400
  const multerErr = new Error('File too large');
  multerErr.name = 'MulterError';
  multerErr.code = 'LIMIT_FILE_SIZE';
  const resMulter = simulateError(multerErr);
  assert.strictEqual(resMulter.statusCode, 400);
  assert.strictEqual(resMulter.jsonResponse.code, 'UPLOAD_LIMIT_FILE_SIZE');

  // D. Production Internal Error Sanitization -> 500
  const secretLeakErr = new Error('Database connection failed at postgres://user:secret123@db:5432');
  const resProd = simulateError(secretLeakErr, true);
  assert.strictEqual(resProd.statusCode, 500);
  assert.ok(!resProd.jsonResponse.error.includes('secret123'), 'Production error must NOT leak internal DB credentials');
  assert.strictEqual(resProd.jsonResponse.requestId, 'test-req-id-123');

  // 4. Enhanced Health Check
  const mockPrismaOk = {
    $queryRaw: async () => [{ 1: 1 }]
  };
  let healthStatus = null;
  let healthData = null;
  const mockHealthRes = {
    status: (code) => {
      healthStatus = code;
      return { json: (d) => { healthData = d; } };
    }
  };

  await createHealthHandler(mockPrismaOk)({}, mockHealthRes);
  assert.strictEqual(healthStatus, 200);
  assert.strictEqual(healthData.status, 'ok');
  assert.strictEqual(healthData.database.status, 'connected');
  assert.ok(typeof healthData.database.latencyMs === 'number');
  assert.ok(healthData.uptimeSeconds >= 0);

  // Probe failure
  const mockPrismaDegraded = {
    $queryRaw: async () => { throw new Error('DB connection refused'); }
  };
  await createHealthHandler(mockPrismaDegraded)({}, mockHealthRes);
  assert.strictEqual(healthStatus, 503);
  assert.strictEqual(healthData.status, 'degraded');
  assert.strictEqual(healthData.database.status, 'disconnected');

  console.log('✅ Phase 16 Observability: All correlation ID, error classification, and health check assertions PASSED');
}

runObservabilityTests().catch(err => {
  console.error('❌ Phase 16 test failed:', err);
  process.exit(1);
});
