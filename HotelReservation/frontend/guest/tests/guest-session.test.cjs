const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const test = require("node:test");

const scripts = path.join(__dirname, "../assets/js");
function page(storage = new Map()) {
  const events = new Map(), main = { hidden: false };
  const context = {
    URL, URLSearchParams, Uint8Array, crypto: webcrypto,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ["2026-11-11T10:00:00+07:00"])); }
      static now() { return new Date("2026-11-11T10:00:00+07:00").getTime(); }
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    document: { currentScript: { src: "http://localhost/assets/js/guest-session.js" }, querySelector: selector => selector === "main" ? main : null },
    location: { href: "http://localhost/pages/my-bookings.html", pathname: "/pages/my-bookings.html", assign() {}, reload() { this.reloaded = true; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); },
    dispatchEvent(event) { for (const fn of events.get(event.type) || []) fn(event); },
  };
  context.window = context;
  vm.createContext(context);
  const load = file => vm.runInContext(readFileSync(path.join(scripts, file), "utf8"), context, { filename: file });
  load("guest-validation.js"); load("guest-session.js");
  return { context, session: context.GuestSession, storage, main, load };
}
const login = (p, identifier) => {
  const result = p.session.start({ identifier, password: "test-password" });
  assert.equal(result.error, null);
  return result.guest;
};
function markWorkspace(p) { for (const key of p.session.privateKeys) p.storage.set(key, "previous-owner"); }
function assertCleared(p) { for (const key of p.session.privateKeys) assert.equal(p.storage.has(key), false, key); }
function assertPreserved(p) { for (const key of p.session.privateKeys) assert.equal(p.storage.get(key), "previous-owner", key); }

test("demo phone never inherits an email guest's placeholder phone or private data", () => {
  const p = page(), alice = login(p, "alice@example.com");
  assert.equal(alice.phone, "0900000000"); markWorkspace(p);
  const demo = login(p, "0900 000-000");
  assert.equal(demo.id, p.session.demoGuestId); assert.notEqual(demo.id, alice.id);
  assertCleared(p);
  assert.equal(JSON.parse(p.storage.get(p.session.workspaceKey)).guestId, demo.id);
});

test("both demo aliases preserve the same workspace, including after profile edits", () => {
  const p = page(); login(p, "0900000000");
  assert.equal(p.session.update({ fullName: "Updated Demo", email: "changed@example.com", phone: "0912345678" }).error, null);
  markWorkspace(p);
  assert.equal(login(p, " GUEST.DEMO@example.com ").id, p.session.demoGuestId); assertPreserved(p);
  assert.equal(login(p, "0900000000").id, p.session.demoGuestId); assertPreserved(p);
});

for (const identifier of ["changed@example.com", "0912345678"]) {
  test(`edited demo contact ${identifier} does not grant its workspace to another identity`, () => {
    const p = page(); login(p, "guest.demo@example.com");
    p.session.update({ fullName: "Updated Demo", email: "changed@example.com", phone: "0912345678" }); markWorkspace(p);
    assert.notEqual(login(p, identifier).id, p.session.demoGuestId); assertCleared(p);
  });
}

test("registered guest can reuse email and explicit phone without losing private data", () => {
  const p = page(), result = p.session.start({ fullName: "Alice Guest", email: "alice@example.com", phone: "0912 345-678", password: "test-password", confirmPassword: "test-password" }, true);
  assert.equal(result.error, null); markWorkspace(p);
  assert.equal(login(p, " ALICE@example.com ").id, result.guest.id); assertPreserved(p);
  assert.equal(login(p, "0912-345 678").id, result.guest.id); assertPreserved(p);
});

test("a non-demo registration using the reserved phone cannot inherit demo data", () => {
  const p = page(); login(p, "0900000000"); markWorkspace(p);
  const result = p.session.start({ fullName: "Alice Guest", email: "alice@example.com", phone: "0900000000", password: "test-password", confirmPassword: "test-password" }, true);
  assert.equal(result.error, null); assert.notEqual(result.guest.id, p.session.demoGuestId); assertCleared(p);
  markWorkspace(p);
  assert.equal(login(p, "0900000000").id, p.session.demoGuestId); assertCleared(p);
});

test("editing a regular profile to the demo email cannot retain its workspace on demo login", () => {
  const p = page(), alice = login(p, "alice@example.com");
  p.session.update({ fullName: "Alice Guest", email: "guest.demo@example.com", phone: "0912345678" }); markWorkspace(p);
  assert.notEqual(login(p, "guest.demo@example.com").id, alice.id); assertCleared(p);
});

for (const identifiers of [["alice@example.com", "bob@example.com"], ["0912345678", "0987654321"], ["guest.demo@example.com", "bob@example.com"]]) {
  test(`switching ${identifiers.join(" to ")} clears every private store`, () => {
    const p = page(), first = login(p, identifiers[0]); markWorkspace(p);
    assert.notEqual(login(p, identifiers[1]).id, first.id); assertCleared(p);
  });
}

test("invalid login leaves the current identity and workspace intact", () => {
  const p = page(), alice = login(p, "alice@example.com"); markWorkspace(p);
  assert.ok(p.session.start({ identifier: "not-an-email", password: "test-password" }).errors);
  assert.equal(p.session.owner(), alice.id); assertPreserved(p);
});

test("failed cleanup blocks both identities; retry clears the entire old workspace", () => {
  const p = page(); login(p, "alice@example.com"); markWorkspace(p);
  const remove = p.context.sessionStorage.removeItem;
  p.context.sessionStorage.removeItem = key => { if (key === "copyPasteHotel.serviceRequests") throw Error("storage unavailable"); remove(key); };
  assert.ok(p.session.start({ identifier: "0900000000", password: "test-password" }).error);
  assert.equal(p.session.load().guest, null);
  assert.equal(JSON.parse(p.storage.get(p.session.key)).state, "clearing");
  p.context.sessionStorage.removeItem = remove;
  login(p, "0900000000"); assertCleared(p);
});

test("logout clears all private stores, session and workspace binding", () => {
  const p = page(); login(p, "alice@example.com"); markWorkspace(p);
  assert.equal(p.session.logout().error, null); assertCleared(p);
  assert.equal(p.storage.has(p.session.key), false); assert.equal(p.storage.has(p.session.workspaceKey), false);
});

test("real booking, service and cart adapters cannot carry old guest data across a switch", () => {
  const p = page(); login(p, "guest.demo@example.com");
  for (const file of ["room-data.js", "search-validation.js", "room-stay.js", "booking-draft.js", "booking-simulation.js", "booking-data.js", "booking-actions.js", "service-data.js", "food-data.js", "food-cart-data.js", "review-data.js"]) p.load(file);
  const c = p.context, contact = { fullName: "Demo Guest", email: "guest.demo@example.com", phone: "0900000000" };
  const draft = c.BookingDraft.create({ roomType: "standard", checkIn: "2026-11-23", checkOut: "2026-11-25", guests: "2", roomCount: "1" }, contact, "", new URLSearchParams());
  assert.equal(c.BookingDraft.save(draft), true);
  const payment = c.BookingSimulation.prepare(), expected = { reference: payment.draft.payment.reference, plan: payment.draft.payment.plan, fingerprint: c.BookingSimulation.fingerprint(payment.draft) };
  assert.equal(c.BookingSimulation.send(expected).error, null);
  const request = c.ServiceRequests.create("CP-B003", "housekeeping", { mode: "asap", roomId: "DEMO-ROOM-F301", note: "Demo request" }, c.ServiceRequests.newId());
  assert.equal(request.error, null);
  assert.equal(c.FoodCart.setQuantity("CP-B003", "water", 2).error, null);
  const oldPage = page(p.storage);
  login(p, "alice@example.com"); assertCleared(p);
  assert.equal(c.BookingData.load().bookings.length, 0);
  assert.equal(c.FoodCart.load("CP-B003").cart.items.length, 0);
  assert.equal(c.ServiceRequests.load("CP-B003").requests.some(r => r.id === request.request.id), false);
  assert.ok(c.ReviewData.saveDraft("CP-B004", 5, "Old page callback").error);
  oldPage.context.dispatchEvent({ type: "pageshow" });
  assert.equal(oldPage.main.hidden, true); assert.equal(oldPage.context.location.reloaded, true);
  login(p, "0900000000"); assertCleared(p);
  assert.equal(c.BookingData.load().bookings.some(b => b.reference === expected.reference), false);
});
