const express = require('express');
const emailRoutes = require('./routes/emailRoutes');
const logger = require('./utils/logger');
const config = require('./config');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({
  message: 'API is running',
  timestamp: new Date(),
}));

app.use('/email', emailRoutes);

// Error handling
app.use((err, req, res, next) => {
  logger.error({ err }, 'Error handler');

  res.status(err.status || 500).json({
    error: config.env === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// JSON 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
