import { spawn } from "node:child_process";

const transientNetworkError = /could not resolve|failed to connect|connection (?:reset|timed out)|remote end hung up|unable to access.*(?:502|503|504)|HTTP (?:502|503|504)|TLS connection was non-properly terminated/i;

export function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

// Each command owns a process group so cancellation also stops npm's children.
export async function runCommand(command, args, {
  cwd, capture = false, allowFailure = false, signal,
  timeoutMs = 10 * 60_000, killGraceMs = 1_000,
  beforeSpawn = async () => {},
  childGroup = async () => {},
} = {}) {
  signal?.throwIfAborted();
  // Persist the launch intent first. If the updater is killed between spawn
  // and recording the child PID, its lock remains ambiguous and cannot be stolen.
  await beforeSpawn();
  signal?.throwIfAborted();
  const grouped = process.platform !== "win32";
  const child = spawn(command, args, {
    cwd, detached: grouped, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  let stdout = "", stderr = "", failure, killTimer;
  const append = (previous, chunk) => capture ? previous + chunk : (previous + chunk).slice(-64_000);
  child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); if (!capture) process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); if (!capture) process.stderr.write(chunk); });
  const target = grouped ? -child.pid : child.pid;
  const kill = (sig) => {
    if (!child.pid) return;
    try { process.kill(target, sig); } catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  const stop = (reason) => {
    if (failure) return;
    failure = reason;
    kill("SIGTERM");
    killTimer = setTimeout(() => kill("SIGKILL"), killGraceMs);
  };
  const completion = new Promise((resolveCompletion) => {
    child.once("error", (error) => { failure = error; });
    child.once("close", (status, exitSignal) => resolveCompletion({ status, signal: exitSignal }));
  });
  let registered = false;
  const abort = () => stop(signal.reason ?? new Error("Command cancelled"));
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(() => stop(Object.assign(new Error(`Command timed out after ${timeoutMs} ms`), { code: "ETIMEDOUT" })), timeoutMs);
  try {
    if (child.pid) {
      try { await childGroup(child.pid, true); registered = true; }
      catch (error) { stop(error); }
    }
    const result = await completion;
    // A shell/npm leader may exit before its children. Keep ownership until the
    // entire group is gone; a crash then leaves a conservatively held lock.
    if (grouped && child.pid && processExists(target)) {
      stop(new Error("Command left child processes running"));
      await new Promise((resolveWait) => setTimeout(resolveWait, killGraceMs + 50));
    }
    if (registered && (!grouped || !processExists(target))) await childGroup(child.pid, false);
    const detail = failure?.message ?? (stderr || stdout).trim();
    if (failure || result.status !== 0) {
      const error = new Error(`${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
      error.code = failure?.code;
      error.result = { ...result, stdout, stderr };
      if (!allowFailure) throw error;
    }
    return { ...result, stdout, stderr, errorCode: failure?.code };
  } finally {
    clearTimeout(timeout);
    clearTimeout(killTimer);
    signal?.removeEventListener("abort", abort);
  }
}

// Retry only transport failures in idempotent Git network operations. A
// rejected push, auth failure, or divergent branch is never retried or forced.
export async function runGitWithRetry(command, args, options = {}, {
  run = runCommand, attempts = 3, retryDelayMs = 1_000,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
} = {}) {
  const network = command === "git" && args.some((arg) => ["fetch", "clone", "ls-remote", "push"].includes(arg));
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await run(command, args, { ...options, ...(network ? { timeoutMs: options.timeoutMs ?? 120_000 } : {}) });
      if (network && result.status !== 0 && !options.signal?.aborted
        && (result.errorCode === "ETIMEDOUT" || transientNetworkError.test(result.stderr ?? "")) && attempt < attempts) {
        options.signal?.throwIfAborted();
        await sleep(retryDelayMs * attempt);
        continue;
      }
      return result;
    } catch (error) {
      if (!network || options.signal?.aborted || attempt >= attempts
        || !(error.code === "ETIMEDOUT" || transientNetworkError.test(error.message))) throw error;
      console.warn(`Transient Git transport failure; retry ${attempt + 1}/${attempts}.`);
      await sleep(retryDelayMs * attempt);
    }
  }
}
