require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '5060', 10),
  streamName: process.env.REDIS_STREAM_EMAIL || 'email_events',
  maxRetries: parseInt(process.env.EMAIL_MAX_RETRIES || '5', 10),
  mailjet: {
    apiKey: process.env.MAILJET_API_KEY,
    apiSecret: process.env.MAILJET_API_SECRET
  },
  defaultFrom: process.env.EMAIL_DEFAULT_FROM,
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined
  }
};
