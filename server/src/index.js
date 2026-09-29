const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

const uploadRoutes = require('./routes/uploadRoutes');
const schemaRoutes = require('./routes/schemaRoutes');
const jobRoutes = require('./routes/jobRoutes');
const { connectDB } = require('./config/db');

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/schemas', schemaRoutes);
app.use('/api/target-schemas', schemaRoutes);
app.use('/api/jobs', jobRoutes);


// Basic health and readiness route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'StreamWeaver API',
    uptime: process.uptime(),
    memory: {
      heapUsedMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(2)
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send('StreamWeaver High-Throughput ETL Service Ready');
});

// Guard against starting server when imported in tests
if (process.env.NODE_ENV !== 'test') {
  connectDB().catch(err => {
    console.warn(`[StreamWeaver Server] Warning: Could not connect to MongoDB automatically: ${err.message}`);
  });

  app.listen(PORT, () => {
    console.log(`[StreamWeaver Server] Running on http://localhost:${PORT}`);
  });
}

module.exports = app;
