const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
require('./config/env'); // Validasi fail-fast variabel lingkungan rahasia (SEC-03)

const prisma = require('./config/db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config/env');
const { requestIdMiddleware, errorHandler, createHealthHandler } = require('./utils/observability');

const app = express();
app.use(requestIdMiddleware);
app.set('trust proxy', 1);
const server = http.createServer(app);

// Setup Socket.io dengan origin kontrol dan handshake auth (SEC-05)
const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(url => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  ...envOrigins,
  'http://localhost:5200',
  'http://localhost:5173',
  'http://127.0.0.1:5200',
  'http://127.0.0.1:5173'
];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes(origin.replace(/\/+$/, ''))) {
        return callback(null, true);
      }
      return callback(new Error('Origin tidak diizinkan oleh CORS policy Socket.IO'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
});

// Middleware Handshake Auth Socket.io (SEC-05 / SEC-007)
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || 
                  (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')) ||
                  socket.handshake.query?.token;

    if (!token) {
      return next(new Error('unauthorized'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.id) {
      return next(new Error('unauthorized'));
    }

    // Validasi akun aktif & ambil hak akses terkini dari database (SEC-007)
    const liveUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, role: true, category_id: true }
    });

    if (!liveUser) {
      return next(new Error('unauthorized'));
    }

    socket.user = {
      id: liveUser.id,
      name: liveUser.name,
      role: liveUser.role,
      category_id: liveUser.category_id
    };
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
    if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes(origin.replace(/\/+$/, ''))) {
      return callback(null, true);
    }
    return callback(null, false);
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
const { getSafeUploadPath } = require('./utils/safePath');

// Protected attachment streaming (SEC-002)
app.get('/uploads/*splat', verifyToken, async (req, res, next) => {
  try {
    const rawSplat = req.params.splat;
    const filename = Array.isArray(rawSplat) ? rawSplat.join('/') : String(rawSplat || '');
    const safePath = getSafeUploadPath(`/uploads/${filename}`);
    if (!safePath) {
      return res.status(404).json({ error: 'Lampiran tidak ditemukan' });
    }

    const targetUrl = `/uploads/${path.basename(safePath)}`;
    const matchingMessages = await prisma.message.findMany({
      where: { attachment_url: targetUrl },
      select: {
        ticket_id: true,
        ticket: {
          select: {
            id: true,
            is_aduan: true,
            categories: { select: { category_id: true } }
          }
        }
      }
    });

    let isAuthorized = false;
    if (['ADMIN', 'SPV', 'L1'].includes(req.user.role)) {
      isAuthorized = true;
    } else if (req.user.role === 'L2' && req.user.category_id) {
      isAuthorized = matchingMessages.some((msg) => (
        msg.ticket?.is_aduan &&
        msg.ticket.categories?.some((cat) => cat.category_id === req.user.category_id)
      ));
    }

    if (!isAuthorized) {
      return res.status(404).json({ error: 'Lampiran tidak ditemukan' });
    }

    res.set('X-Content-Type-Options', 'nosniff');
    return res.sendFile(safePath);
  } catch (err) {
    return next(err);
  }
});

// Register Routes Lainnya
app.use('/api/auth', authRoutes);
app.use('/api/chat', verifyToken, chatRoutes); 
app.use('/api/reports', verifyToken, reportRoutes); 
app.use('/api/admin', verifyToken, requireRole(['ADMIN']), adminRoutes);
app.use('/api/settings', verifyToken, settingRoutes);
app.use('/api/hts', verifyToken, htsRoutes);

// Enhanced Health check endpoint with database probe
app.get('/api/health', createHealthHandler(prisma));

// Centralized, Classified & Safe Error Handler
app.use(errorHandler);

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

