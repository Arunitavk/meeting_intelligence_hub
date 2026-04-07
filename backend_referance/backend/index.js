import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from './db/database.js';
import uploadRouter from './routes/upload.js';
import chatRouter from './routes/chat.js';

// Initialise DB on startup (creates tables if they don't exist)
getDb();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'DELETE'],
}));

app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Meeting Intelligence backend running on http://localhost:${PORT}`);
});
