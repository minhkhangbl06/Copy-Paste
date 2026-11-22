const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function page(respond) {
  const storage = new Map(), requests = [], events = new Map();
  const context = {
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, Intl,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    document: { currentScript: { src: "http://localhost/guest/assets/js/guest-session.js" }, querySelector: () => null },
    location: { href: "http://localhost/guest/pages/my-bookings.html", assign() {}, reload() {} },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    addEventListener(type, callback) { if (!events.has(type)) events.set(type, []); events.get(type).push(callback); },
    dispatchEvent(event) { for (const callback of events.get(event.type) || []) callback(event); },
    async fetch(url, options) { requests.push({ url, options }); return respond(url, options); },
  };
  context.window = context;
  vm.createContext(context);
  for (const name of ["guest-config", "guest-validation", "guest-api", "guest-session"]) vm.runInContext(readFileSync(path.join(__dirname, "../assets/js", name + ".js"), "utf8"), context);
  return { context, storage, requests, session: context.GuestSession, api: context.GuestAPI };
}
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const credentials = { identifier: "alice@example.com", password: "test-password" };
const authenticated = (id = 42) => response({ data: { user: { id, name: "Alice Guest", email: "alice@example.com", phone: null, role: "guest" }, access_token: "test-token-" + id, expires_in: 28800 } });

test("login sends credentials to the real endpoint and stores only the returned identity and token", async () => {
  const p = page(() => authenticated());
  assert.equal((await p.session.start(credentials)).error, null);
  assert.equal(p.session.owner(), "42");
  assert.equal(p.session.load().guest.phone, "");
  assert.equal(p.requests[0].url, "http://127.0.0.1:8000/api/auth/login");
  assert.deepEqual(JSON.parse(p.requests[0].options.body), { email: credentials.identifier, password: credentials.password });
  assert.ok(!JSON.stringify([...p.storage.values()]).includes(credentials.password));
  await p.api.request("/guest/bookings");
  assert.equal(p.requests[1].options.headers.Authorization, "Bearer test-token-42");
});

test("wrong credentials and unavailable backend never create a simulated session", async () => {
  for (const reply of [() => response({ message: "Sai thông tin" }, 401), () => { throw Error("offline"); }]) {
    const p = page(reply);
    assert.ok((await p.session.start(credentials)).error);
    assert.equal(p.session.owner(), null);
    assert.equal(p.storage.size, 0);
  }
});

test("registration maps frontend field names to the backend contract", async () => {
  const p = page(() => authenticated());
  const result = await p.session.start({ fullName: "Alice Guest", email: "alice@example.com", phone: "0912345678", password: "test-password", confirmPassword: "test-password" }, true);
  assert.equal(result.error, null);
  const body = JSON.parse(p.requests[0].options.body);
  assert.equal(body.name, "Alice Guest"); assert.equal(body.role, undefined); assert.equal(body.confirmPassword, undefined);
});

test("account switch clears all former simulated private data", async () => {
  let id = 1;
  const p = page(() => authenticated(id));
  await p.session.start(credentials);
  p.session.privateKeys.forEach(key => p.storage.set(key, "old-owner"));
  id = 2; await p.session.start(credentials);
  assert.equal(p.session.owner(), "2");
  p.session.privateKeys.forEach(key => assert.equal(p.storage.has(key), false));
});

test("logout revokes the server token before clearing the local session", async () => {
  const p = page(url => url.endsWith("/logout") ? response(null, 204) : authenticated());
  await p.session.start(credentials);
  assert.equal((await p.session.logout()).error, null);
  assert.equal(p.requests[1].options.method, "POST");
  assert.equal(p.requests[1].options.headers.Authorization, "Bearer test-token-42");
  assert.equal(p.session.token(), null);
});

test("401 on a private API clears the expired identity", async () => {
  const p = page(url => url.endsWith("/login") ? authenticated() : response({ message: "Unauthenticated" }, 401));
  await p.session.start(credentials);
  await assert.rejects(p.api.request("/guest/bookings"));
  assert.equal(p.session.owner(), null);
});

test("redirects reject external paths and preserve multi-room selection", () => {
  const p = page(() => authenticated());
  for (const target of ["https://evil.example/guest/pages/invoice.html", "//evil.example/", "javascript:alert(1)", "/guest/auth/login.html"]) assert.equal(p.session.safeReturn(target).href, p.session.home);
  const url = p.session.safeReturn("pages/booking.html?roomIds=1%2C2&checkIn=2026-12-01&password=secret");
  assert.equal(url.searchParams.get("roomIds"), "1,2"); assert.equal(url.searchParams.has("password"), false);
});

test("invoice lines stay with the selected booking room; shared charges stay separate", () => {
  const p = page(() => authenticated());
  const groups = p.api.groupItems([
    { booking_room_id: 12, room_id: 102, amount: "900000" },
    { room_id: 101, amount: "50000" },
    { room_id: null, amount: "20000" },
  ], [{ id: 11, room_id: 101 }, { id: 12, room_id: 102 }]);
  assert.equal(groups.length, 3); assert.equal(groups[0].items[0].amount, "50000");
  assert.equal(groups[1].items[0].amount, "900000"); assert.equal(groups[2].room, null);
  assert.equal(p.api.money(null), "Chưa có thông tin");
});
