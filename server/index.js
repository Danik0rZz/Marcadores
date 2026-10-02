import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import './db.js'; // Opens the database and runs schema, migrations & seed on import
import apiRoutes from './routes.js';
import { localOnly } from './localOnly.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
// Loopback only by default: the API has no authentication, so it must not be
// reachable from other machines on the network.
const HOST = process.env.HOST || '127.0.0.1';

app.use(localOnly);
app.use(express.json({ limit: '50mb' }));

// Mount API routes
app.use('/api', apiRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend build if dist exists
const distPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Fallback for SPA routing without path-to-regexp asterisk syntax error
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Backend server running on http://${HOST}:${PORT}`);
});

export default app;
