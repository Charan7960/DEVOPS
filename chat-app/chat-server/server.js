const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const mongoose = require('mongoose');
const path = require('path');

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongodb:27017/chatapp';
const SERVER_ID = process.env.HOSTNAME || `server-${Math.random().toString(36).substr(2, 5)}`;

// ─────────────────────────────────────────────
// MONGOOSE MESSAGE MODEL
// ─────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  message: { type: String, required: true },
  room: { type: String, default: 'general' },
  serverId: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// ─────────────────────────────────────────────
// EXPRESS + HTTP SERVER
// ─────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint — useful for monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', serverId: SERVER_ID, timestamp: new Date() });
});

// API: Get recent messages from MongoDB
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find({ room: 'general' })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ─────────────────────────────────────────────
// SOCKET.IO SERVER
// ─────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Allow polling fallback for environments that block WebSockets
  transports: ['websocket', 'polling']
});

// ─────────────────────────────────────────────
// STARTUP: Connect Redis + MongoDB, then listen
// ─────────────────────────────────────────────
async function start() {
  // ── 1. Connect to MongoDB ──────────────────
  try {
    await mongoose.connect(MONGO_URL);
    console.log(`[${SERVER_ID}] ✅ Connected to MongoDB`);
  } catch (err) {
    console.error(`[${SERVER_ID}] ❌ MongoDB connection failed:`, err.message);
    // Continue without MongoDB (messages won't persist)
  }

  // ── 2. Connect to Redis and attach adapter ─
  try {
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error(`[${SERVER_ID}] Redis pub error:`, err));
    subClient.on('error', (err) => console.error(`[${SERVER_ID}] Redis sub error:`, err));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    console.log(`[${SERVER_ID}] ✅ Connected to Redis`);

    // ★ KEY LINE: This is what makes scaling work!
    // All Socket.IO instances share events through Redis
    io.adapter(createAdapter(pubClient, subClient));
    console.log(`[${SERVER_ID}] ✅ Redis adapter attached — scaling enabled`);
  } catch (err) {
    console.error(`[${SERVER_ID}] ❌ Redis connection failed:`, err.message);
    console.warn(`[${SERVER_ID}] ⚠️  Running WITHOUT Redis — scaling won't propagate messages`);
  }

  // ── 3. Socket.IO event handlers ───────────
  io.on('connection', (socket) => {
    console.log(`[${SERVER_ID}] 🔌 New connection: ${socket.id}`);

    // Broadcast to everyone that a new user connected
    socket.broadcast.emit('system', {
      message: `A user joined the chat`,
      serverId: SERVER_ID
    });

    // User sets their username
    socket.on('set-username', (username) => {
      socket.username = username.trim().substring(0, 20) || 'Anonymous';
      console.log(`[${SERVER_ID}] 👤 ${socket.username} connected`);

      // Send current server info to client
      socket.emit('server-info', { serverId: SERVER_ID });

      // Notify others
      socket.broadcast.emit('system', {
        message: `${socket.username} joined the chat`,
        serverId: SERVER_ID
      });
    });

    // User sends a chat message
    socket.on('chat-message', async (data) => {
      const username = socket.username || 'Anonymous';
      const messageText = (data.message || '').trim().substring(0, 500);

      if (!messageText) return;

      const payload = {
        username,
        message: messageText,
        serverId: SERVER_ID,          // Shows WHICH server handled this message
        timestamp: new Date().toISOString()
      };

      // Save to MongoDB (non-blocking)
      try {
        await new Message({ ...payload, room: 'general' }).save();
      } catch (err) {
        console.error(`[${SERVER_ID}] DB save error:`, err.message);
      }

      // Broadcast to ALL connected clients across ALL servers (via Redis adapter)
      io.emit('chat-message', payload);

      console.log(`[${SERVER_ID}] 💬 ${username}: ${messageText}`);
    });

    // User is typing indicator
    socket.on('typing', () => {
      socket.broadcast.emit('typing', {
        username: socket.username || 'Someone'
      });
    });

    socket.on('stop-typing', () => {
      socket.broadcast.emit('stop-typing', {
        username: socket.username || 'Someone'
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      const username = socket.username || 'A user';
      console.log(`[${SERVER_ID}] ❌ ${username} disconnected`);
      socket.broadcast.emit('system', {
        message: `${username} left the chat`,
        serverId: SERVER_ID
      });
    });
  });

  // ── 4. Start HTTP server ───────────────────
  server.listen(PORT, () => {
    console.log(`[${SERVER_ID}] 🚀 Chat server running on port ${PORT}`);
  });
}

start().catch(console.error);
