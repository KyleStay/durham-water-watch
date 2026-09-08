const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchAndRead(url, options, policy, read) {
  const {
    fetchImpl = fetch,
    retries = 2,
    timeoutMs = 15_000,
    retryDelayMs = 250,
  } = policy;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs} ms`)), timeoutMs);
    const signal = options.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    try {
      const response = await fetchImpl(url, { ...options, signal });
      if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) {
        return { response, body: await read(response) };
      }
      await response.body?.cancel();
      lastError = new Error(`Source returned retryable status ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    } finally {
      clearTimeout(timer);
    }
    if (retryDelayMs > 0) await wait(retryDelayMs * (attempt + 1));
  }
  throw lastError;
}

export function fetchTextWithRetry(url, options = {}, policy = {}) {
  return fetchAndRead(url, options, policy, (response) => response.text());
}

export function fetchJsonWithRetry(url, options = {}, policy = {}) {
  return fetchAndRead(url, options, policy, (response) => response.json());
}
