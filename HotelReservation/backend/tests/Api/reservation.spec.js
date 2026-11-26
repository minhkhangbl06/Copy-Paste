const { expect, test } = require('@playwright/test');

function futureDate(daysAhead) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

test('a guest can find, reserve and release a room', async ({ request }) => {
  const dates = {
    check_in_date: futureDate(7),
    check_out_date: futureDate(9),
  };

  const search = await request.get('/api/rooms/available', { params: dates });
  expect(search.status()).toBe(200);
  const availability = await search.json();
  expect(availability.status).toBe('success');
  expect(availability.data.rooms.length).toBeGreaterThan(0);
  const roomId = availability.data.rooms[0].id;

  const booking = {
    ...dates,
    room_ids: [roomId],
    guest_name: 'Playwright Guest',
    guest_phone: '0900000001',
  };

  const created = await request.post('/api/bookings', { data: booking });
  expect(created.status()).toBe(201);
  const confirmation = await created.json();
  expect(confirmation.status).toBe('success');
  expect(confirmation.data).toMatchObject({ room_id: roomId, status: 'confirmed' });
  const bookingId = confirmation.data.id;

  const occupied = await request.get('/api/rooms/available', { params: dates });
  expect(occupied.status()).toBe(200);
  expect((await occupied.json()).data.rooms).not.toContainEqual(expect.objectContaining({ id: roomId }));

  const conflict = await request.post('/api/bookings', {
    data: { ...booking, guest_name: 'Second Guest', guest_phone: '0900000002' },
  });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).status).toBe('error');

  const cancelled = await request.post('/api/bookings/' + bookingId + '/cancel');
  expect(cancelled.status()).toBe(200);
  expect(await cancelled.json()).toMatchObject({
    status: 'success',
    data: { booking_id: bookingId, status: 'cancelled', refund_rate: '100%' },
  });

  const released = await request.get('/api/rooms/available', { params: dates });
  expect(released.status()).toBe(200);
  expect((await released.json()).data.rooms).toContainEqual(expect.objectContaining({ id: roomId }));
});

test('multi-room booking creates 2 rooms and 4 nights, rolls back on conflict, and releases after cancel', async ({ request }) => {
  const dates = {
    check_in_date: futureDate(14),
    check_out_date: futureDate(16),
  };

  const search = await request.get('/api/rooms/available', { params: dates });
  expect(search.status()).toBe(200);
  const rooms = (await search.json()).data.rooms;
  expect(rooms.length).toBeGreaterThanOrEqual(3);

  const [roomA, roomB, roomC] = rooms;

  const created = await request.post('/api/bookings', {
    data: {
      ...dates,
      room_ids: [roomA.id, roomB.id],
      guest_name: 'Playwright Multi Room',
      guest_phone: '0900000010',
    },
  });
  expect(created.status()).toBe(201);
  const booking = (await created.json()).data;
  expect(booking.booking_rooms).toHaveLength(2);
  const totalNights = booking.booking_rooms.reduce((sum, br) => sum + br.room_nights.length, 0);
  expect(totalNights).toBe(4);

  // Partial conflict: roomB is taken, roomC is free -> entire request must fail and keep roomC available
  const conflict = await request.post('/api/bookings', {
    data: {
      ...dates,
      room_ids: [roomB.id, roomC.id],
      guest_name: 'Playwright Conflict Guest',
      guest_phone: '0900000011',
    },
  });
  expect(conflict.status()).toBe(409);

  const afterConflict = await request.get('/api/rooms/available', { params: dates });
  expect((await afterConflict.json()).data.rooms).toContainEqual(expect.objectContaining({ id: roomC.id }));

  // Cancel and rebook the released nights
  const cancelled = await request.post('/api/bookings/' + booking.id + '/cancel');
  expect(cancelled.status()).toBe(200);
  expect((await cancelled.json()).data.refund_rate).toBe('100%');

  const rebooked = await request.post('/api/bookings', {
    data: {
      ...dates,
      room_ids: [roomA.id, roomB.id],
      guest_name: 'Playwright Rebook Guest',
      guest_phone: '0900000012',
    },
  });
  expect(rebooked.status()).toBe(201);
  expect((await rebooked.json()).data.booking_rooms).toHaveLength(2);
});