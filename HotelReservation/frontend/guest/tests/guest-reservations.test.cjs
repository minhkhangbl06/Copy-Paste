const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

function setup(reply) {
  const storage = new Map(), requests = [];
  let owner = "42";
  const context = {
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, Intl,
    GuestSession: { token: () => "test-token", owner: () => owner, clear: () => { owner = null; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    async fetch(url, options) {
      const route = url.replace("http://127.0.0.1:8000/api", "");
      requests.push({ route, method: options.method, body: options.body && JSON.parse(options.body) });
      const result = await reply(route, options);
      return { ok: !result?.errorStatus, status: result?.errorStatus || 200, json: async () => result?.errorStatus ? { message: "API error" } : { data: result } };
    },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["guest-config", "guest-api", "search-validation", "guest-reservations"]) vm.runInContext(readFileSync(path.join(__dirname, "../assets/js", file + ".js"), "utf8"), context);
  return { context, storage, requests, reservations: context.GuestReservations };
}
const created = [
  { id: 10, booking_code: "BK-10", room_id: 1, room: { id: 1, room_number: "101" }, total_room_amount: "1200000", deposit_amount: "500000", status: "checked_in" },
  { id: 11, booking_code: "BK-11", room_id: 2, room: { id: 2, room_number: "102" }, total_room_amount: "1800000", deposit_amount: "600000", status: "checked_in" },
];
const payload = { room_ids: [1, 2], check_in_date: "2099-12-01", check_out_date: "2099-12-04", guest_name: "Test Guest", guest_phone: "0912345678" };

test("multiple rooms use one real POST /bookings and keep every returned booking ID", async () => {
  const p = setup(() => created);
  const result = await p.reservations.create(payload);
  assert.equal(p.requests.length, 1); assert.equal(p.requests[0].route, "/bookings");
  assert.deepEqual(p.requests[0].body, payload);
  assert.equal(JSON.stringify(result.ids), "[10,11]");
  const receipt = JSON.parse(p.storage.get(p.reservations.key));
  assert.deepEqual(receipt, { owner: "42", groups: [[10, 11]] });
  assert.ok(!p.storage.get(p.reservations.key).includes("1200000"));
});

test("server conflict does not create a receipt or retry the booking", async () => {
  const p = setup(() => ({ errorStatus: 409 }));
  await assert.rejects(p.reservations.create(payload));
  assert.equal(p.storage.size, 0); assert.equal(p.requests.length, 1);
});

test("a lost booking response is marked uncertain instead of inviting an automatic retry", async () => {
  const p = setup(() => { throw Error("connection lost"); });
  await assert.rejects(p.reservations.create(payload), error => error.bookingUncertain === true);
  assert.equal(p.storage.size, 0); assert.equal(p.requests.length, 1);
});

test("receipt storage failure after server success is reported as created, preventing blind retry", async () => {
  const p = setup(() => created);
  p.context.sessionStorage.setItem = () => { throw Error("storage unavailable"); };
  await assert.rejects(p.reservations.create(payload), error => error.bookingCreated === true && error.message.includes("BK-10"));
  assert.equal(p.requests.length, 1);
});

test("list reloads only actual booking IDs without requesting the all-guests list", async () => {
  const p = setup(route => route === "/bookings" ? created : { ...created[Number(route.split("/").pop()) - 10], total_room_amount: "999999" });
  await p.reservations.create(payload);
  const result = await p.reservations.list();
  assert.equal(result[0].total_room_amount, "999999");
  assert.deepEqual(p.requests.slice(1).map(request => request.route), ["/bookings/10", "/bookings/11"]);
  await assert.rejects(p.reservations.load([999]));
  assert.equal(p.requests.length, 3);
});

test("changed account cannot inherit receipts", async () => {
  const p = setup(() => created);
  await p.reservations.create(payload);
  p.context.GuestSession.owner = () => "other-user";
  assert.equal((await p.reservations.list()).length, 0);
});

test("availability reload rejects a selected room that the API no longer returns", async () => {
  const p = setup(() => ({ rooms: [{ id: 1, room_number: "101", price_per_night: "500000" }] }));
  await assert.rejects(p.reservations.selectedRooms(payload));
  assert.ok(p.requests[0].route.startsWith("/rooms/available?"));
});

test("invoice preview uses server invoice_items and never issues an invoice", async () => {
  const line = { item_type: "service", room_id: 2, description: "Laundry", quantity: 2, unit_price: "50000", amount: "100000" };
  const p = setup(route => route === "/bookings" ? created : route.startsWith("/invoices?") ? [] : { charges: { total_amount: "1900000" }, invoice_items: [line] });
  await p.reservations.create(payload);
  const result = await p.reservations.invoice(created[1]);
  assert.equal(result.detailAvailable, true); assert.equal(result.invoice_items[0].amount, "100000");
  assert.equal(p.requests[1].route, "/invoices?search=BK-11");
  assert.equal(p.requests[2].route, "/bookings/11/invoice/preview"); assert.equal(p.requests[2].method, "GET");
  assert.equal(p.requests.filter(request => request.method === "POST").length, 1);
});

test("old backend without invoice_items does not receive fabricated detailed lines", async () => {
  const p = setup(route => route === "/bookings" ? created : route.startsWith("/invoices?") ? [] : { charges: { total_amount: "1900000" } });
  await p.reservations.create(payload);
  const result = await p.reservations.invoice(created[1]);
  assert.equal(result.detailAvailable, false); assert.equal(result.invoice_items.length, 0);
});

test("selecting the second legacy room sends its booking_id and room_id", async () => {
  const p = setup(route => route === "/bookings" ? created : { id: 77, total_amount: "100000" });
  await p.reservations.create(payload);
  const allocation = p.context.GuestAPI.allocations(created[1])[0];
  await p.reservations.order(created[1], allocation, [{ service_id: 4, quantity: 2 }], "Laundry");
  assert.deepEqual(p.requests[1], { route: "/service-orders", method: "POST", body: { booking_id: 11, room_id: 2, items: [{ service_id: 4, quantity: 2 }], charge_to_room: true, notes: "Laundry" } });
});

test("official invoice lookup is scoped to the known booking code and verifies booking_id", async () => {
  const p = setup(route => route === "/bookings" ? created : route.startsWith("/invoices?") ? [{ id: 77, booking_id: 11 }] : { id: 77, booking_id: 11, items: [{ room_id: 2, amount: "100000" }], total_amount: "100000" });
  await p.reservations.create(payload);
  const result = await p.reservations.invoice(created[1]);
  assert.equal(result.invoice.id, 77); assert.equal(result.invoice_items[0].room_id, 2);
  assert.deepEqual(p.requests.slice(1).map(request => request.route), ["/invoices?search=BK-11", "/invoices/77"]);
});

test("multi-room booking sends the chosen booking_room_id supported by Khang API", async () => {
  const multi = { id: 50, status: "checked_in", booking_rooms: [{ id: 100, room_id: 1 }, { id: 101, room_id: 2 }] };
  const p = setup(route => route === "/bookings" ? multi : { id: 77 });
  await p.reservations.create(payload);
  await p.reservations.order(multi, multi.booking_rooms[1], [{ service_id: 4, quantity: 1 }], "");
  assert.equal(p.requests[1].body.booking_room_id, 101); assert.equal(p.requests[1].body.room_id, 2);
  await assert.rejects(p.reservations.order(multi, { id: 999, room_id: 99 }, [], ""));
  assert.equal(p.requests.length, 2);
});
