import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fail, resolve } from "./core.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export function launch(argv, cwd, env, log) {
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const fd = fs.openSync(log, "a");
  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    env,
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  fs.closeSync(fd);
  const state = { child, error: null, exited: false };
  state.done = new Promise((r) => {
    child.once("error", (e) => {
      state.error = e;
      state.exited = true;
      r();
    });
    child.once("exit", (code, signal) => {
      state.exited = true;
      state.code = code;
      state.signal = signal;
      r();
    });
  });
  return state;
}
function signal(s, sig) {
  if (!s.child.pid) return;
  try {
    process.kill(-s.child.pid, sig);
  } catch (e) {
    if (e.code !== "ESRCH") throw e;
  }
}
export async function stop(s, timeout = 5000) {
  signal(s, "SIGTERM");
  let timer;
  try {
    await Promise.race([
      s.done,
      new Promise((r) => {
        timer = setTimeout(r, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  signal(s, "SIGKILL");
  await s.done;
}
export async function startRuntime(root, runtime, logDir, owned) {
  for (const group of runtime.startupGroups) {
    const started = group.map((id) => {
      const p = runtime.projects.find((x) => x.id === id);
      const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...Object.fromEntries(
          Object.entries(p.environment).map(([k, v]) => [
            k,
            typeof v === "string" ? v : resolve(root, v.path),
          ]),
        ),
      };
      const log = path.join(logDir, `${id}.log`);
      const s = launch(p.start.argv, resolve(root, p.start.cwd), env, log);
      owned.push({ s, timeout: p.stop.timeoutMs });
      return { p, s, env, log };
    });
    await Promise.all(
      started.map(async ({ p, s, env, log }) => {
        const until = Date.now() + p.health.timeoutMs;
        let healthy = false;
        while (Date.now() < until) {
          if (s.error)
            fail("TOOLING_UNAVAILABLE", `${p.id}: ${s.error.message}`);
          if (s.exited)
            fail("STARTUP_FAILED", `${p.id} exited (${s.code}); log ${log}`);
          try {
            const r = await fetch(p.health.url, {
              signal: AbortSignal.timeout(
                Math.min(1000, Math.max(1, until - Date.now())),
              ),
            });
            healthy =
              r.status === p.health.status &&
              (await r.json()).status === p.health.json.status;
          } catch {}
          if (healthy) break;
          await delay(50);
        }
        if (!healthy)
          fail("STARTUP_FAILED", `${p.id}: health timeout; log ${log}`);
        const facilities = p.testFacilities;
        if (
          facilities &&
          env[facilities.enable.variable] === facilities.enable.enabledValue
        ) {
          for (const [name, f] of Object.entries({
            reset: facilities.reset,
            ...(facilities.clock ? { clock: facilities.clock } : {}),
          })) {
            try {
              const options = {
                method: f.method,
                signal: AbortSignal.timeout(p.health.timeoutMs),
              };
              if (name === "clock") {
                if (env[f.initialEnvironmentVariable] === undefined)
                  throw Error("Missing clock binding");
                options.headers = { "content-type": "application/json" };
                options.body = JSON.stringify({
                  [f.bodyField]: env[f.initialEnvironmentVariable],
                });
              }
              const r = await fetch(new URL(f.path, p.health.url), options);
              if (r.status !== f.status) throw Error(`status ${r.status}`);
            } catch (e) {
              fail("STARTUP_FAILED", `${p.id} ${name}: ${e.message}`);
            }
          }
        }
      }),
    );
  }
}
