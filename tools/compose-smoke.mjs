#!/usr/bin/env node
// ENV-01 smoke check for the Compose stack: every project is healthy, a customer can sign
// in, the frontend points the browser at the published services, CORS allows the
// frontend origin, and the services' traces reach the collector over the Compose network.
// Usage: docker compose up -d --build && node tools/compose-smoke.mjs
import { setTimeout as sleep } from "node:timers/promises";

const PROJECTS = {
  frontend: 3000,
  customer: 4001,
  reservation: 4002,
  "veterinarian-services": 4003,
  checkout: 4004,
  "payment-fake": 4010,
  "otel-collector": 4318,
};
const ORIGIN = "http://localhost:3000";
const results = [];
const check = async (name, fn) => {
  try {
    results.push([name, true, await fn()]);
  } catch (error) {
    results.push([name, false, error.message]);
  }
};
const get = async (url, init) => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
};

for (const [name, port] of Object.entries(PROJECTS)) {
  await check(
    `${name} healthy`,
    async () =>
      (await (await get(`http://localhost:${port}/health`)).json()).status,
  );
}
await check(
  "collector reset",
  async () =>
    (await get("http://localhost:4318/test/reset", { method: "POST" })).status,
);

let token;
await check("customer login", async () => {
  const body = await (
    await get("http://localhost:4001/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        username: "jordan.rivera",
        password: "petclinic-demo",
      }),
    })
  ).json();
  token = body.token;
  return body.user.role;
});

await check("frontend config points at published services", async () => {
  const config = await (await get(`${ORIGIN}/config.json`)).json();
  const wrong = Object.values(config).filter(
    (u) => !/^http:\/\/localhost:400[1-4]$/.test(u),
  );
  if (wrong.length) throw new Error(`unexpected URLs ${wrong}`);
  return Object.keys(config).join(", ");
});

await check("CORS allows the frontend origin", async () => {
  const res = await fetch("http://localhost:4002/veterinarians", {
    method: "OPTIONS",
    headers: { origin: ORIGIN, "access-control-request-method": "GET" },
  });
  const allowed = res.headers.get("access-control-allow-origin");
  if (allowed !== ORIGIN) throw new Error(`allow-origin is ${allowed}`);
  return allowed;
});

await check(
  "reservation call with the customer's token",
  async () =>
    (
      await get("http://localhost:4002/veterinarians", {
        headers: { authorization: `Bearer ${token}`, origin: ORIGIN },
      })
    ).status,
);

await check("traces reach the collector", async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { spans } = await (
      await get("http://localhost:4318/test/spans")
    ).json();
    const services = [...new Set(spans.map((s) => s.serviceName))].sort();
    if (
      services.includes("petclinic-customer") &&
      services.includes("petclinic-reservation")
    )
      return services.join(", ");
    await sleep(250);
  }
  throw new Error("no spans from petclinic-customer and petclinic-reservation");
});

for (const [name, ok, detail] of results)
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  (${detail})`}`,
  );
process.exitCode = results.every(([, ok]) => ok) ? 0 : 1;
