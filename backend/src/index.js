const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Middleware
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(cors());
app.use(helmet()); // Mengamankan HTTP Headers

// Rate Limiter: Maksimal 300 request per 15 menit per IP (Fase 6 Security)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 300, 
  message: { error: 'Terlalu banyak request, silakan coba lagi nanti.' }
});
app.use('/api', limiter); // Terapkan pembatasan hanya pada rute API

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Injeksi objek io ke setiap request agar bisa dipakai di Controller
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
const { verifyToken, requireRole } = require('./middlewares/authMiddleware');

// Register Routes
app.use('/api/webhook', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat', verifyToken, chatRoutes); 
app.use('/api/reports', verifyToken, reportRoutes); 
app.use('/api/admin', verifyToken, requireRole(['ADMIN']), adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'HTS Chat Integration API is running',
    timestamp: new Date().toISOString(),
  });
});

// Socket connection handler
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

