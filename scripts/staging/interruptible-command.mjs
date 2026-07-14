import { spawn } from "node:child_process";

export function runInterruptibleCommand({
  command,
  args = [],
  cwd,
  env,
  input,
  timeoutMs = 15 * 60_000,
  maxBuffer = 128 * 1024 * 1024,
  signal,
}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let error = null;
    let aborted = false;
    let timedOut = false;
    let settled = false;
    let forceKillTimer = null;
    let terminationStarted = false;

    const killTree = (requestedSignal) => {
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, requestedSignal);
          return;
        } catch {
          // Fall back to the direct child if its process group has already closed.
        }
      }
      try {
        child.kill(requestedSignal);
      } catch {
        // Close handling below remains authoritative.
      }
    };

    function terminate(reason) {
      if (
        terminationStarted ||
        settled ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) return;
      terminationStarted = true;
      if (reason === "abort") aborted = true;
      if (reason === "timeout") {
        timedOut = true;
        if (!error) error = new Error(`Interruptible command timed out after ${timeoutMs}ms`);
      }
      killTree("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) killTree("SIGKILL");
      }, 2_000);
      forceKillTimer.unref();
    }

    const append = (current, chunk) => {
      const next = Buffer.concat([current, Buffer.from(chunk)]);
      if (next.length > maxBuffer) {
        error = new Error("Interruptible command exceeded its output limit");
        terminate("output_limit");
        return next.subarray(0, maxBuffer);
      }
      return next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });

    const timeout = setTimeout(() => terminate("timeout"), timeoutMs);
    timeout.unref();
    const onAbort = () => terminate("abort");
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();

    child.on("error", (childError) => {
      error = childError;
    });
    child.on("close", (status, childSignal) => {
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", onAbort);
      const finish = () => resolve({
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        status,
        signal: childSignal,
        error,
        aborted,
        timedOut,
      });
      if (status !== 0 || childSignal || error || aborted || timedOut) {
        killTree("SIGTERM");
        setTimeout(() => {
          killTree("SIGKILL");
          finish();
        }, 250);
      } else {
        finish();
      }
    });

    if (input != null) {
      child.stdin.on("error", (stdinError) => {
        if (!settled && !terminationStarted && !error) error = stdinError;
      });
      if (!terminationStarted && child.exitCode === null && child.signalCode === null) {
        child.stdin.end(input);
      }
    }
  });
}
