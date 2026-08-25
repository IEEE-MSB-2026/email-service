const Redis = require('ioredis');
const config = require('../config');

let redisClient = null;

function getRedisClient() {
  if (!redisClient && (config.redis.url || config.redis.host)) {
    try {
      const opts = {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      };
      if (config.redis.url) {
        redisClient = new Redis(config.redis.url, opts);
      } else {
        redisClient = new Redis({
          host: config.redis.host || '127.0.0.1',
          port: config.redis.port || 6379,
          password: config.redis.password,
          ...opts,
        });
      }
      redisClient.on('error', () => {
        // Handled silently for offline test fallback
      });
      redisClient.connect().catch(() => {});
    } catch {
      redisClient = null;
    }
  }
  return redisClient;
}

// Bounded in-memory TTL cache with capacity limit for offline/test fallback
const MAX_LOCAL_ENTRIES = 2000;
const localStore = new Map();

function pruneLocalStore() {
  const now = Date.now();
  for (const [key, expiresAt] of localStore.entries()) {
    if (expiresAt <= now) {
      localStore.delete(key);
    }
  }
  if (localStore.size >= MAX_LOCAL_ENTRIES) {
    // Delete oldest inserted keys to prevent unbounded memory growth
    const keysToDelete = Array.from(localStore.keys()).slice(0, Math.floor(MAX_LOCAL_ENTRIES / 4));
    for (const k of keysToDelete) {
      localStore.delete(k);
    }
  }
}

function makeKey(payload) {
  if (!payload) return 'empty_payload';
  if (payload.idempotencyKey) return String(payload.idempotencyKey);
  const to = Array.isArray(payload.to) ? payload.to.join(',') : String(payload.to || '');
  return `${to}|${payload.subject || ''}|${payload.templateId || ''}|${payload.retries || 0}`;
}

async function checkAndSetAsync(payload, ttlMs = null) {
  if (!config.idempotencyEnabled) return true;

  const effectiveTtlMs = ttlMs || config.idempotencyTtlMs;
  const key = makeKey(payload);
  const client = getRedisClient();

  if (client && client.status === 'ready') {
    try {
      const res = await client.set(`idempotency:${key}`, '1', 'PX', effectiveTtlMs, 'NX');
      return res === 'OK';
    } catch {
      // Fallback to local store if Redis command fails
    }
  }

  return checkAndSetLocal(key, effectiveTtlMs);
}

function checkAndSetLocal(key, effectiveTtlMs) {
  pruneLocalStore();
  const now = Date.now();
  const existing = localStore.get(key);
  if (existing && existing > now) {
    return false; // duplicate
  }
  localStore.set(key, now + effectiveTtlMs);
  return true;
}

function checkAndSet(payload, ttlMs = null) {
  if (!config.idempotencyEnabled) return true;
  const effectiveTtlMs = ttlMs || config.idempotencyTtlMs;
  const key = makeKey(payload);
  return checkAndSetLocal(key, effectiveTtlMs);
}

module.exports = {
  checkAndSet,
  checkAndSetAsync,
  makeKey,
};
