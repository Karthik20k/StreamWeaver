const express = require('express');
const cors = require('cors');
require('dotenv').config();

const uploadRouter = require('./routes/upload');
const schemasRouter = require('./routes/schemas');
const { router: jobsRouter } = require('./routes/jobs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Content-Length']
}));

app.use(express.json());

app.use('/api/upload', uploadRouter);
app.use('/api/schemas', schemasRouter);
app.use('/api/jobs', jobsRouter);

app.get('/health', (req, res) => {
  const mem = process.memoryUsage();

  res.status(200).json({
    status: 'online',
    service: 'StreamWeaver API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2),
      rssMB: (mem.rss / 1024 / 1024).toFixed(2)
    }
  });
});

app.get('/', (req, res) => {
  res.send('StreamWeaver High-Throughput ETL Service Ready');
});

app.use((req, res) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`
  });
});

app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);

  res.status(500).json({
    error: 'Internal server error',
    detail: err.message
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[StreamWeaver Server] Running on http://localhost:${PORT}`);
    console.log(
      `[StreamWeaver Server] Upload endpoint -> http://localhost:${PORT}/api/upload/stream`
    );
  });
}

module.exports = app;