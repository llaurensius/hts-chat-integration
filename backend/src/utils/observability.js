const crypto = require('crypto');

/**
 * Observability & Safe Logging Utility
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'apikey',
  'secret',
  'jwt_secret',
  'authorization',
  'cookie',
  'cookie_data',
  'ci_session',
  'key',
  'auth_token'
]);

/**
 * Redact sensitive fields from objects before logging
 */
const redactSensitive = (data, depth = 0) => {
  if (depth > 5) return '[Truncated]';
  if (!data || typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => redactSensitive(item, depth + 1));
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret')) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = redactSensitive(value, depth + 1);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

/**
 * Middleware for Correlation / Request ID tracing
 */
const requestIdMiddleware = (req, res, next) => {
  const clientReqId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  req.id = typeof clientReqId === 'string' && clientReqId.trim().length > 0
    ? clientReqId.trim().slice(0, 64)
    : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

/**
 * Centralized, Classified Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
  const requestId = req.id || 'N/A';
  let statusCode = err.status || err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let userMessage = err.message || 'Terjadi kesalahan internal server';

  // 1. Prisma database error classification
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      statusCode = 409;
      errorCode = 'RESOURCE_ALREADY_EXISTS';
      userMessage = 'Data dengan identitas tersebut sudah terdaftar pada sistem.';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      errorCode = 'RESOURCE_NOT_FOUND';
      userMessage = 'Data yang diminta tidak ditemukan di basis data.';
    } else if (err.code === 'P2003') {
      statusCode = 400;
      errorCode = 'FOREIGN_KEY_VIOLATION';
      userMessage = 'Operasi ditolak karena memiliki ketergantungan relasi data yang tidak valid.';
    } else {
      statusCode = 400;
      errorCode = `DATABASE_${err.code}`;
      userMessage = 'Permintaan data ke basis data gagal diproses.';
    }
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    errorCode = `UPLOAD_${err.code}`;
    if (err.code === 'LIMIT_FILE_SIZE') {
      userMessage = 'Ukuran berkas melebihi batas maksimum 10MB.';
    } else {
      userMessage = `Kesalahan unggah berkas: ${err.message}`;
    }
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'INVALID_OR_EXPIRED_TOKEN';
    userMessage = 'Sesi otentikasi tidak valid atau telah kedaluwarsa. Silakan masuk kembali.';
  } else if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorCode = 'MALFORMED_JSON_BODY';
    userMessage = 'Format payload JSON dalam request body tidak valid.';
  }

  // Sanitize internal error details on production
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    userMessage = 'Terjadi kendala pada peladen. Silakan hubungi Administrator dengan menyertakan Request ID.';
  }

  // Structured safe logging (no sensitive secrets or passwords)
  console.error(`[API Error][ReqID: ${requestId}] ${req.method} ${req.originalUrl} - Status: ${statusCode} - Code: ${errorCode}: ${err.message}`);

  return res.status(statusCode).json({
    error: userMessage,
    code: errorCode,
    requestId: requestId
  });
};

/**
 * Health check query handler with database probe
 */
const createHealthHandler = (prisma) => async (req, res) => {
  let dbStatus = 'connected';
  let dbLatencyMs = null;
  const startTime = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - startTime;
  } catch (dbErr) {
    dbStatus = 'disconnected';
    console.error('[Health Check] Database connectivity probe failed:', dbErr.message);
  }

  const isHealthy = dbStatus === 'connected';
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'hts-chat-integration-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs
    },
    memoryUsageMb: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    }
  });
};

module.exports = {
  redactSensitive,
  requestIdMiddleware,
  errorHandler,
  createHealthHandler
};
