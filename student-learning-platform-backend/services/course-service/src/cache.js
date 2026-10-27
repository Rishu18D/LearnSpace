import { createHash } from "node:crypto";
import { createClient } from "redis";

const cacheVersionKey = "slp:course:public:version";
const cacheTtlSeconds = 60;
let cache;
let client;

function logCacheError(operation, error) {
  console.warn(JSON.stringify({
    level: "warn",
    service: "course-service",
    message: `Course cache ${operation} failed`,
    error: error.message
  }));
}

export function createCourseCache(redisClient, ttlSeconds = cacheTtlSeconds) {
  return {
    async version() {
      if (!redisClient?.isReady) return null;
      try {
        return await redisClient.get(cacheVersionKey) ?? "0";
      } catch (error) {
        logCacheError("version lookup", error);
        return null;
      }
    },
    key(version, scope, parameters) {
      const digest = createHash("sha256").update(JSON.stringify(parameters)).digest("hex");
      return `slp:course:public:${version}:${scope}:${digest}`;
    },
    async get(key) {
      if (!redisClient?.isReady) return undefined;
      let value;
      try {
        value = await redisClient.get(key);
      } catch (error) {
        logCacheError("read", error);
        return undefined;
      }
      if (value === null) return undefined;
      try {
        return JSON.parse(value);
      } catch (error) {
        logCacheError("decode", error);
        try {
          await redisClient.del(key);
        } catch (deleteError) {
          logCacheError("invalid-entry removal", deleteError);
        }
        return undefined;
      }
    },
    async set(key, value) {
      if (!redisClient?.isReady) return;
      try {
        await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
      } catch (error) {
        logCacheError("write", error);
      }
    },
    async invalidate() {
      if (!redisClient?.isReady) return;
      try {
        await redisClient.incr(cacheVersionKey);
      } catch (error) {
        logCacheError("invalidation", error);
      }
    }
  };
}

cache = createCourseCache(null);

export async function connectCourseCache() {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL is not configured; course catalog caching is disabled");
    return;
  }
  let url;
  try {
    url = new URL(process.env.REDIS_URL);
  } catch {
    throw new Error("REDIS_URL must be a valid redis:// or rediss:// connection URL");
  }
  if (!["redis:", "rediss:"].includes(url.protocol)) {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }

  client = createClient({ url: process.env.REDIS_URL });
  client.on("error", error => logCacheError("connection", error));
  try {
    await client.connect();
  } catch (error) {
    logCacheError("initial connection; continuing without cache", error);
    client.destroy();
    client = undefined;
    cache = createCourseCache(null);
    return;
  }
  cache = createCourseCache(client);
  console.log("Course catalog cache connected");
}

export async function disconnectCourseCache() {
  if (client?.isOpen) await client.quit();
  client = undefined;
  cache = createCourseCache(null);
}

export const courseCache = {
  version: (...args) => cache.version(...args),
  key: (...args) => cache.key(...args),
  get: (...args) => cache.get(...args),
  set: (...args) => cache.set(...args),
  invalidate: (...args) => cache.invalidate(...args)
};
