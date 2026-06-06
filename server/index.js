import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

import { config } from './config.js';
import { initRealtime } from './realtime.js';
import { bindRealtime } from './services/notifications.js';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import drillRoutes from './routes/drills.js';
import reportRoutes from './routes/reports.js';
import exportRoutes from './routes/exports.js';
import notificationRoutes from './routes/notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '8mb' })); // map snapshots can be large
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/drills', drillRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, env: config.env }));

// Static frontend (mobile-responsive PWA)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
// SPA fallback (non-API routes serve the app shell)
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Centralised error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

const server = http.createServer(app);
const io = initRealtime(server);
bindRealtime(io);

server.listen(config.port, () => {
  console.log(`\n🚨 School Emergency Drill System running on http://localhost:${config.port}`);
  console.log(`   Environment: ${config.env}`);
  if (config.allowDevLogin) console.log('   ⚠️  Dev login is ENABLED (ALLOW_DEV_LOGIN=true)');
});

export { app, server };
