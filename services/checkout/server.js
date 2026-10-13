import {
  Runtime,
  id,
  ok,
  created,
  fail,
  owner,
  assigned,
  assignedOrAdmin,
  Locks,
  copy,
  canonical,
  Problem,
} from "../platform/runtime.js";
const app = new Runtime("checkout", 4004, [
  "CUSTOMER_URL",
  "RESERVATION_URL",
  "VETERINARIAN_SERVICES_URL",
  "PAYMENT_PROVIDER_URL",
]);
const urls = {
  customer: process.env.CUSTOMER_URL,
  reservation: process.env.RESERVATION_URL,
  catalog: process.env.VETERINARIAN_SERVICES_URL,
  payment: process.env.PAYMENT_PROVIDER_URL,
};
let bills, byVisit, paidBookings, attempts, locks, incompleteBills;
function checkout(user, checkoutId) {
  app.attrs({ "checkout.id": checkoutId });
  const c = owner(user, bills.get(checkoutId));
  app.attrs({ "visit.id": c.visitId, "reservation.id": c.reservationId });
  return c;
}
// ENG-02 REV-016 / D-48: billing actions follow the visit's *current* veterinarian,
// which Reservation owns and a fill-in can change after the bill exists. Ask it each
// time instead of keeping a copy taken at finalization.
async function currentVet(visitId) {
  return (await app.dependency(`${urls.reservation}/visits/${visitId}`))
    .veterinarianId;
}
function remaining(c) {
  c.remainingBalance =
    c.totalAmount - c.previouslyPaidAmount - (c.promotion?.appliedAmount ?? 0);
}
async function account(c, type, amount, paymentId) {
  return app.dependency(
    `${urls.customer}/internal/customers/${c.customerId}/account-changes`,
    {
      method: "POST",
      body: {
        visitId: c.visitId,
        type,
        amount,
        currency: "USD",
        ...(paymentId ? { paymentId } : {}),
      },
    },
  );
}
async function complete(c) {
  const r = await app.client(
    `${urls.reservation}/internal/reservations/${c.reservationId}/complete`,
    {
      method: "POST",
      body: {
        financialOutcome: c.remainingBalance === 0 ? "settled" : "outstanding",
      },
    },
  );
  if (
    r.status !== 200 &&
    !(r.status === 409 && r.body.code === "already_completed")
  )
    fail(502, "dependency_failed");
}
function paymentAttrs(c, a, replayed, cash = false, vet) {
  app.attrs({
    "checkout.id": c.id,
    "visit.id": c.visitId,
    "reservation.id": c.reservationId,
    "payment.attempt.id": a?.attemptId,
    "checkout.replayed": replayed,
    ...(cash
      ? { "veterinarian.id": vet, "payment.purpose": "visit_balance" }
      : {}),
  });
}
async function authorize(a) {
  const r = await app.client(`${urls.payment}/authorize`, {
    method: "POST",
    payment: true,
    body: {
      attemptId: a.attemptId,
      amount: a.amount,
      currency: a.currency,
      mockMethodReference: a.mockMethodReference,
      purpose: a.purpose,
    },
  });
  if (r.status !== 200) fail(502, "dependency_failed");
  a.outcome = r.body.outcome;
  if (r.body.authorizationReference)
    a.authorizationReference = r.body.authorizationReference;
}
function replay(record, fingerprint) {
  if (record.fingerprint !== fingerprint) fail(409, "idempotency_conflict");
  app.outcome(record.outcome);
  app.attrs({
    "checkout.replayed": true,
    "payment.attempt.id": record.attempt?.attemptId,
  });
  if (record.error)
    fail(record.error.status, record.error.code, record.error.extra);
  return ok({ ...copy(record.result), replayed: true });
}
function rememberError(record, error, outcome = "failed") {
  record.outcome = outcome;
  record.error = {
    status: error instanceof Problem ? error.status : 502,
    code: error instanceof Problem ? error.code : "dependency_failed",
    extra: error.extra ?? {},
  };
}
app.route(
  "POST",
  "/internal/booking-fees",
  ({ body, key }) =>
    locks.run(`booking:${body.reservationId}`, async () => {
      const cash = body.method === "cash";
      app.attrs({
        "reservation.id": body.reservationId,
        "veterinarian.id": body.recordedByVeterinarianId,
        "payment.purpose": "booking_fee",
        "checkout.replayed": false,
      });
      const scopedKey = `booking:${body.reservationId}:${key}`,
        fingerprint = canonical(body);
      if (attempts.has(scopedKey))
        return replay(attempts.get(scopedKey), fingerprint);
      if (paidBookings.has(body.reservationId)) {
        const result = paidBookings.get(body.reservationId);
        app.attrs({
          "payment.attempt.id": result.attempt.attemptId,
          "checkout.replayed": true,
        });
        app.outcome("recorded");
        return ok({ ...copy(result), replayed: true });
      }
      const a = {
        attemptId: id(),
        customerId: body.customerId,
        reservationId: body.reservationId,
        purpose: "booking_fee",
        amount: body.amount,
        currency: "USD",
        timestamp: app.now(),
        ...(cash
          ? {
              outcome: "cash_recorded",
              recordedByVeterinarianId: body.recordedByVeterinarianId,
            }
          : {
              outcome: "declined",
              mockMethodReference: body.mockMethodReference,
            }),
      };
      const record = { fingerprint, attempt: a };
      attempts.set(scopedKey, record);
      app.attrs({ "payment.attempt.id": a.attemptId });
      try {
        if (!cash) await authorize(a);
        const paid = a.outcome !== "declined",
          result = {
            reservationId: body.reservationId,
            paid,
            replayed: false,
            attempt: a,
            ...(paid ? { paymentId: a.attemptId } : {}),
          };
        record.result = copy(result);
        record.outcome = cash ? "recorded" : a.outcome;
        if (paid) paidBookings.set(body.reservationId, copy(result));
        app.outcome(record.outcome);
        return ok(result);
      } catch (error) {
        rememberError(record, error);
        throw error;
      }
    }),
  (body) => (body?.method === "cash" ? "record_cash" : null),
);
app.route(
  "POST",
  "/visits/{visitId}/checkout",
  ({ params, user }) =>
    locks.run(`finalize:${params.visitId}`, async () => {
      app.attrs({
        "visit.id": params.visitId,
        "veterinarian.id": user.veterinarianId,
      });
      if (byVisit.has(params.visitId)) {
        const existing = bills.get(byVisit.get(params.visitId));
        app.attrs({ "reservation.id": existing.reservationId });
        assigned(user, await currentVet(existing.visitId));
        fail(409, "already_finalized");
      }
      if (incompleteBills.has(params.visitId)) fail(502, "dependency_failed");
      const v = await app.dependency(
        `${urls.reservation}/visits/${params.visitId}`,
      );
      app.attrs({ "reservation.id": v.reservationId });
      assigned(user, v.veterinarianId);
      const r = await app.dependency(
        `${urls.reservation}/reservations/${v.reservationId}`,
      );
      if (r.reservationState !== "Accepted" || r.visitId !== v.id)
        fail(409, "invalid_state");
      const fees = await app.dependency(
        `${urls.catalog}/fees?serviceIds=${v.performedServices.join(",")}`,
      );
      const lines = v.performedServices.map((serviceId) => {
        const s = fees.fees.find((s) => s.id === serviceId);
        if (!s) fail(422, "unknown_service");
        return { serviceId, description: s.name, priceAmount: s.feeAmount };
      });
      const total = lines.reduce(
        (sum, l) => sum + l.priceAmount,
        r.bookingFeeAmount,
      );
      const c = {
        id: id(),
        customerId: v.customerId,
        reservationId: r.id,
        visitId: v.id,
        currency: "USD",
        billedLines: lines,
        totalAmount: total,
        previouslyPaidAmount: r.bookingFeePaid ? r.bookingFeeAmount : 0,
        remainingBalance: total, // DELIBERATE DEFECT (CI-02 failing-PR proof): ignores the paid booking fee
        paymentAttempts: [],
        promotion: null,
      };
      incompleteBills.add(v.id); // An uncertain downstream write must never trigger a second charge.
      await account(c, "charge", total);
      if (r.bookingFeePaid)
        await account(c, "credit", r.bookingFeeAmount, r.bookingPaymentId);
      bills.set(c.id, c);
      byVisit.set(v.id, c.id);
      incompleteBills.delete(v.id);
      app.attrs({
        "checkout.id": c.id,
        "checkout.remaining_amount_cents": c.remainingBalance,
      });
      if (c.remainingBalance === 0) await complete(c);
      app.outcome("finalized");
      return created(c);
    }),
  "finalize_bill",
);
app.route("GET", "/visits/{visitId}/checkout", ({ params, user }) =>
  ok(checkout(user, byVisit.get(params.visitId))),
);
app.route("GET", "/checkouts/{checkoutId}", ({ params, user }) =>
  ok(checkout(user, params.checkoutId)),
);
app.route("GET", "/checkouts", ({ user, query }) =>
  ok(
    [...bills.values()].filter(
      (c) =>
        (user.role !== "customer" || user.customerId === c.customerId) &&
        ["customerId", "visitId", "reservationId"].every(
          (k) => !query.has(k) || query.get(k) === c[k],
        ),
    ),
  ),
);
app.route(
  "POST",
  "/checkouts/{checkoutId}/promotion",
  ({ params, user, body }) =>
    locks.run(`bill:${params.checkoutId}`, async () => {
      const c = checkout(user, params.checkoutId);
      app.attrs({ "veterinarian.id": user.veterinarianId });
      assignedOrAdmin(user, await currentVet(c.visitId)); // D-41: administrator bypass
      if (c.promotion) fail(409, "already_applied");
      if (c.remainingBalance === 0) fail(409, "nothing_owed");
      const amount = body.amount ?? 0;
      const promotion = {
        id: id(),
        checkoutId: c.id,
        visitId: c.visitId,
        appliedByVeterinarianId: user.veterinarianId,
        amount,
        appliedAmount: Math.min(amount, c.remainingBalance),
        appliedAt: app.now(),
      };
      // ENG-02 REV-002: same fix as REV-001 -- confirm the discount with Customer before
      // marking it applied locally. Before this, a failed account() call still left
      // c.promotion set, so a retry read as "already_applied" even though Customer never
      // recorded the discount, with no way to tell the two states apart.
      await account(c, "discount", promotion.appliedAmount);
      c.promotion = promotion;
      remaining(c);
      app.attrs({
        "promotion.id": promotion.id,
        "promotion.amount_cents": amount,
        "promotion.applied_amount_cents": promotion.appliedAmount,
      });
      if (c.remainingBalance === 0) await complete(c);
      app.outcome("applied");
      return created(c);
    }),
  "apply_promotion",
);
async function pay({ params, user, body, key }, cash) {
  return locks.run(`bill:${params.checkoutId}`, async () => {
    const c = checkout(user, params.checkoutId);
    // Cash recording is vet/admin-only (D-41 bypass); card payment is customer-only and
    // has no assigned-veterinarian concept to check.
    paymentAttrs(c, null, false, cash, user.veterinarianId);
    if (cash) assignedOrAdmin(user, await currentVet(c.visitId));
    const scopedKey = `visit:${c.id}:${key}`,
      fingerprint = canonical({ ...body, method: cash ? "cash" : "card" });
    if (attempts.has(scopedKey))
      return replay(attempts.get(scopedKey), fingerprint);
    if (c.remainingBalance === 0) fail(409, "already_settled");
    if (body.amount > c.remainingBalance) fail(422, "invalid_amount");
    const a = {
      attemptId: id(),
      customerId: c.customerId,
      reservationId: c.reservationId,
      visitId: c.visitId,
      purpose: "visit_balance",
      amount: body.amount,
      currency: "USD",
      timestamp: app.now(),
      ...(cash
        ? {
            outcome: "cash_recorded",
            recordedByVeterinarianId: user.veterinarianId,
          }
        : {
            outcome: "declined",
            mockMethodReference: body.mockMethodReference,
          }),
    };
    const record = { fingerprint, attempt: a };
    attempts.set(scopedKey, record);
    paymentAttrs(c, a, false, cash, user.veterinarianId);
    let paid = cash;
    try {
      if (!cash) {
        await authorize(a);
        paid = a.outcome === "authorized";
      }
      c.paymentAttempts.push(a);
      if (paid) {
        // ENG-02 REV-001: call account() (the downstream credit that is the
        // actual system of record) before touching c's own balance fields, so
        // a failure here leaves c exactly as it was — never optimistically
        // "paid" when Customer never recorded the credit.
        await account(c, "credit", a.amount, a.attemptId);
        c.previouslyPaidAmount += a.amount;
        remaining(c);
      }
      await complete(c);
      record.outcome = cash
        ? "recorded"
        : paid
          ? c.remainingBalance === 0
            ? "settled"
            : "partially_paid"
          : "declined";
      record.result = copy({ checkout: c, attempt: a, replayed: false });
      app.outcome(record.outcome);
      return ok(copy(record.result));
    } catch (error) {
      const reported = paid
        ? new Problem(502, "authorized_completion_failed", {
            paymentAttemptId: a.attemptId,
          })
        : error;
      rememberError(
        record,
        reported,
        paid ? "authorized_completion_failed" : "failed",
      );
      throw reported;
    }
  });
}
app.route(
  "POST",
  "/checkouts/{checkoutId}/payments",
  (r) => pay(r, false),
  "pay",
);
app.route(
  "POST",
  "/checkouts/{checkoutId}/cash-payments",
  (r) => pay(r, true),
  "record_cash",
);
await app.serve(() => {
  bills = new Map();
  byVisit = new Map();
  paidBookings = new Map();
  attempts = new Map();
  incompleteBills = new Set();
  locks = new Locks();
});
