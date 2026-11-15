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
  expect(confirmation.data[0]).toMatchObject({ room_id: roomId, status: 'confirmed' });
  const bookingId = confirmation.data[0].id;

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
