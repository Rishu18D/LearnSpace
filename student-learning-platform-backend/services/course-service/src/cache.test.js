import test from "node:test";
import assert from "node:assert/strict";
import { createCourseCache } from "./cache.js";

function createRedisMock() {
  const values = new Map();
  return {
    isReady: true,
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, options) {
      assert.equal(options.EX, 60);
      values.set(key, value);
    },
    async incr(key) {
      const next = Number(values.get(key) || 0) + 1;
      values.set(key, String(next));
      return next;
    },
    async del(key) {
      values.delete(key);
    }
  };
}

test("course cache stores JSON with a TTL and separates catalog generations", async () => {
  const redis = createRedisMock();
  const cache = createCourseCache(redis);
  const response = { courses: [{ title: "Public course" }], pagination: { page: 1 } };

  const version = await cache.version();
  const key = cache.key(version, "catalog", { page: 1 });
  assert.equal(version, "0");
  assert.equal(await cache.get(key), undefined);

  await cache.set(key, response);
  assert.deepEqual(await cache.get(key), response);

  await cache.invalidate();
  const newVersion = await cache.version();
  assert.equal(newVersion, "1");
  assert.notEqual(cache.key(version, "catalog", { page: 1 }), cache.key(newVersion, "catalog", { page: 1 }));
  assert.equal(await cache.get(cache.key(newVersion, "catalog", { page: 1 })), undefined);
});

test("course cache skips Redis operations when the client is not ready", async () => {
  const cache = createCourseCache({ isReady: false });
  assert.equal(await cache.version(), null);
  assert.equal(await cache.get("key"), undefined);
  await cache.set("key", { ok: true });
  await cache.invalidate();
});

test("course cache removes malformed entries and treats them as misses", async () => {
  const redis = createRedisMock();
  redis.values.set("invalid", "{");
  const cache = createCourseCache(redis);
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    assert.equal(await cache.get("invalid"), undefined);
    assert.equal(redis.values.has("invalid"), false);
  } finally {
    console.warn = originalWarn;
  }
});
