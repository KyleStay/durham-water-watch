import assert from "node:assert/strict";
import test from "node:test";

import { fetchTextWithRetry } from "../scripts/source-fetch.mjs";

test("source fetch retries a bounded transient failure", async () => {
  let calls = 0;
  const { response, body } = await fetchTextWithRetry("https://example.test", {}, {
    retries: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return new Response("body", { status: calls === 1 ? 503 : 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(body, "body");
  assert.equal(calls, 2);
});

test("source fetch stops after the configured number of attempts", async () => {
  let calls = 0;
  const { response } = await fetchTextWithRetry("https://example.test", {}, {
    retries: 1,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return new Response("body", { status: 503 });
    },
  });

  assert.equal(response.status, 503);
  assert.equal(calls, 2);
});

test("source fetch timeout remains active while the response body is read", async () => {
  await assert.rejects(fetchTextWithRetry("https://example.test", {}, {
    retries: 0,
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => ({
      status: 200,
      text: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }),
  }), /timed out after 10 ms/);
});
