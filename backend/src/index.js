const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
require('./config/env'); // Validasi fail-fast variabel lingkungan rahasia (SEC-03)

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config/env');

const app = express();
const server = http.createServer(app);

// Setup Socket.io dengan origin kontrol dan handshake auth (SEC-05)
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';
const ALLOWED_ORIGINS = [
  FRONTEND_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin tidak diizinkan oleh CORS policy Socket.IO'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
});

// Middleware Handshake Auth Socket.io (SEC-05)
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || 
                  (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')) ||
                  socket.handshake.query?.token;

    if (!token) {
      return next(new Error('unauthorized'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    return next(new Error('unauthorized'));
  }
});

// Middleware
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin tidak diizinkan oleh CORS policy REST API'), false);
  },
  credentials: true
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:", "*"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Izinkan gambar dari backend dimuat frontend
}));

// Rate Limiter API umum: Maksimal 1000 request per 15 menit per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  skip: (req) => req.originalUrl.startsWith('/api/webhook'),
  message: { error: 'Terlalu banyak request, silakan coba lagi nanti.' }
});
app.use('/api', limiter);

// Rate Limiter khusus Webhook: Maksimal 300 request per menit per IP (SEC-01)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { error: 'Terlalu banyak webhook request dari IP ini, coba lagi nanti.' }
});
app.use('/api/webhook', webhookLimiter);

// Injeksi objek io ke setiap request agar bisa dipakai di Controller & Webhook
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Import Routes
const webhookRoutes = require('./routes/webhook');
const chatRoutes = require('./routes/chat');
const reportRoutes = require('./routes/report');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const settingRoutes = require('./routes/setting');
const htsRoutes = require('./routes/hts');
const { verifyToken, requireRole } = require('./middlewares/authMiddleware');

// Register Webhook Route terlebih dahulu (menggunakan body parser mandiri limit 10MB)
app.use('/api/webhook', webhookRoutes);

// Global body parser untuk seluruh rute API lainnya dengan batas aman 2MB (SEC-01)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Register Routes Lainnya
app.use('/api/auth', authRoutes);
app.use('/api/chat', verifyToken, chatRoutes); 
app.use('/api/reports', verifyToken, reportRoutes); 
app.use('/api/admin', verifyToken, requireRole(['ADMIN']), adminRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/hts', verifyToken, htsRoutes);

// Centralized Error Handler (Express)
app.use((err, req, res, next) => {
  console.error(`[Unhandled API Error] ${req.method} ${req.originalUrl}:`, err);
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan internal server' : err.message
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'HTS Chat Integration API is running',
    timestamp: new Date().toISOString(),
  });
});

// Socket connection handler (SEC-05)
io.on('connection', (socket) => {
  const user = socket.user || {};
  console.log(`[Socket] Authenticated client connected: ${user.name || user.id || 'User'} (${user.role || 'Staff'}) [ID: ${socket.id}]`);

  if (user.id) socket.join(`user_${user.id}`);
  if (user.role) socket.join(`role_${user.role}`);
  if (user.role === 'L2' && user.category_id) {
    socket.join(`category_${user.category_id}`);
  }

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${user.name || user.id || socket.id}`);
  });
});

const { startHtsKeepAliveService } = require('./services/htsKeepAliveService');
const { startFileCleanupService } = require('./services/fileCleanupService');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  // Inisialisasi background heartbeat sesi HTS (Fase 1 - V4)
  startHtsKeepAliveService(15);
  // Inisialisasi background retensi file uploads (RES-03)
  startFileCleanupService(90, 24);
});

// Process Lifecycle & Graceful Shutdown
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  process.exit(1);
});
process.on('SIGTERM', async () => {
  console.log('[System] Menerima SIGTERM, menutup server secara anggun...');
  server.close(async () => {
    const prisma = require('./config/db');
    await prisma.$disconnect();
    process.exit(0);
  });
});

