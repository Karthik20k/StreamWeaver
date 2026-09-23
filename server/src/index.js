const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Basic health and readiness route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'StreamWeaver API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send('StreamWeaver High-Throughput ETL Service Ready');
});

// Guard against starting server when imported in tests
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[StreamWeaver Server] Running on http://localhost:${PORT}`);
  });
}

module.exports = app;
