// Additional engineering evidence for existing D-12 / ENG-01 obligations.
// These checks supplement, and never replace, the frozen specification suites.
import { it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  ServiceFixture,
  problem,
  reservationBody,
} from "../../../spec/tests/support/service-fixture.js";

it("invalid idempotency keys are rejected before contacting the provider", async (t) => {
  const fixture = new ServiceFixture("checkout");
  t.after(() => fixture.stop());
  await fixture.start();
  await fixture.finalized();
  await fixture.call("POST", `/checkouts/${fixture.checkout.id}/payments`, {
    body: { amount: 5000, mockMethodReference: "fake-card-approve" },
    headers: { "idempotency-key": "not-a-uuid" },
    expected: 400,
  });
  assert.equal((await fixture.providerCalls()).length, 0);
});

it("an appointment must start exactly on the hour, including milliseconds", async (t) => {
  const fixture = new ServiceFixture("reservation");
  t.after(() => fixture.stop());
  await fixture.start();
  const result = await fixture.call("POST", "/reservations", {
    body: {
      ...reservationBody(),
      scheduledStart: "2026-10-12T09:00:00.001-05:00",
      scheduledEnd: "2026-10-12T10:00:00.001-05:00",
    },
    expected: 422,
  });
  assert.equal(result.body.code, "invalid_slot");
});

it("authorized payment with failed completion: concurrent and sequential retries never charge or credit again", async (t) => {
  const fixture = new ServiceFixture("checkout");
  t.after(() => fixture.stop());
  await fixture.start();
  await fixture.finalized();
  fixture.stubs.reservation.respond(
    "POST",
    "/internal/reservations/{reservationId}/complete",
    409,
    problem(409, "invalid_state"),
  );
  const key = randomUUID();
  const request = () =>
    fixture.call("POST", `/checkouts/${fixture.checkout.id}/payments`, {
      actor: "jordan.rivera",
      body: { amount: 5000, mockMethodReference: "fake-card-approve" },
      headers: { "idempotency-key": key },
      expected: 502,
    });
  const responses = await Promise.all([request(), request()]);
  responses.push(await request());
  for (const response of responses) {
    assert.equal(response.body.code, "authorized_completion_failed");
    assert.equal(
      response.body.paymentAttemptId,
      responses[0].body.paymentAttemptId,
    );
  }
  assert.equal((await fixture.providerCalls()).length, 1);
  const credits = fixture.stubs.customer.requests.filter(
    (request) =>
      request.body?.type === "credit" && request.body.amount === 5000,
  );
  assert.equal(credits.length, 1);
  assert.equal(
    fixture.stubs.reservation.requests.filter((request) =>
      request.path.endsWith("/complete"),
    ).length,
    1,
  );
});

// Skipped for the Python Checkout (r4), on purpose. ENG-02 REV-003
// (docs/engineering-reviews/eng-02-review-r4-python-2026-10-07.md): the Python build
// relies on Customer's per-visit charge dedupe instead of refusing to retry. This is
// accepted and documented, not fixed. The review loop never ends,
// so decide when to stop. The JavaScript build still runs this check.
const pythonCheckout = existsSync(
  new URL("../../../services/checkout/requirements.txt", import.meta.url),
);

it(
  "uncertain bill creation cannot issue a second account charge",
  {
    skip:
      pythonCheckout &&
      "accepted for Python Checkout: ENG-02 REV-003 (see comment)",
  },
  async (t) => {
    const fixture = new ServiceFixture("checkout");
    t.after(() => fixture.stop());
    await fixture.start();
    // A disconnected Customer may already have applied a write. Never blindly retry.
    await fixture.stubs.customer.stop();
    const request = () =>
      fixture.call("POST", `/visits/${fixture.visit.id}/checkout`, {
        expected: 502,
      });
    assert.equal((await request()).body.code, "dependency_failed");
    await fixture.stubs.customer.start();
    const before = fixture.stubs.customer.requests.length;
    assert.equal((await request()).body.code, "dependency_failed");
    assert.equal(fixture.stubs.customer.requests.length, before);
  },
);
