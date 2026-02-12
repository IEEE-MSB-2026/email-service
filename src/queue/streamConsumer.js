const Redis = require('ioredis');
const { streamName, redis, maxRetries } = require('../config');
const logger = require('../utils/logger');
const { validateEmailPayload } = require('../validation');
const { renderTemplate } = require('../services/templateService');
const { sendViaMailjet, buildMessage } = require('../services/sendProvider');
const { checkAndSet } = require('../utils/idempotencyStore');
const { randomUUID } = require('crypto');

const GROUP = 'email_service_group';

function parseEntry(entry) {
  const obj = {};
  for (let i = 0; i < entry[1].length; i += 2) {
    obj[entry[1][i]] = entry[1][i + 1];
  }
  try { return JSON.parse(obj.payload); } catch { return null; }
}

async function startConsumer() {
  const client = redis.url
    ? new Redis(redis.url)
    : new Redis({ host: redis.host, port: redis.port, password: redis.password });
  await client.ping();
  try {
    await client.xgroup('CREATE', streamName, GROUP, '$', 'MKSTREAM');
  } catch (e) {
    if (!/BUSYGROUP/.test(e.message)) throw e;
  }
  logger.info({ stream: streamName }, 'Email stream consumer started');

  async function loop() {
    try {
      const entries = await client.xreadgroup('GROUP', GROUP, 'consumer-1', 'BLOCK', 5000, 'COUNT', 10, 'STREAMS', streamName, '>');
      if (entries) {
        for (const [s, arr] of entries) {
          for (const entry of arr) {
            const payload = parseEntry(entry);
            if (!payload) {
              logger.warn('Invalid payload in stream');
              continue;
            }
            try {
              validateEmailPayload(payload);
              if (!checkAndSet(payload)) {
                logger.info({ id: payload.id }, 'Duplicate ignored');
                await client.xack(streamName, GROUP, entry[0]); // Acknowledge even if duplicate
                await client.xdel(streamName, entry[0]); // Remove from stream after ack
                continue;
              }
              if (payload.templateId && !payload.text && !payload.html) {
                payload.text = renderTemplate(payload.templateId, payload.templateVersion, payload.templateVars || {});
              }
              const msg = buildMessage(payload);
              const result = await sendViaMailjet(msg);
              if (!result.success) {
                payload.retries = (payload.retries || 0) + 1;
                if (payload.retries <= maxRetries) {
                  await client.xadd(streamName, '*', 'payload', JSON.stringify({...payload, id: randomUUID()}));
                  logger.warn({ retries: payload.retries }, 'Retry enqueued');
                } else {
                  logger.error({ id: payload.id }, 'Max retries exceeded');
                  await client.xack(streamName, GROUP, entry[0]);
                  continue;
                }
              }
              await client.xack(streamName, GROUP, entry[0]);
              await client.xdel(streamName, entry[0]); // Remove from stream after ack
            } catch (err) {
              logger.error({ err }, 'Processing failed');
              await client.xack(streamName, GROUP, entry[0]);
              await client.xdel(streamName, entry[0]); // Remove from stream after ack
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Consumer loop error');
    } finally {
      setImmediate(loop);
    }
  }
  loop();
}

module.exports = { startConsumer };
