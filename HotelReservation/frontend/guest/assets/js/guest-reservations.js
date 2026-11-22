"use strict";
(() => {
  const api = window.GuestAPI, session = window.GuestSession;
  const key = "copyPasteHotel.bookingReceipts";
  const idOf = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  function readIds(value) {
    const ids = String(value || "").split(",").map(idOf);
    if (!ids.length || ids.some(id => id === null) || new Set(ids).size !== ids.length) throw new Error("Vui lòng chọn booking từ danh sách của bạn.");
    return ids;
  }
  function receipts() {
    const owner = session.owner();
    if (!owner) return [];
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const saved = JSON.parse(raw);
    if (saved.owner !== owner) return [];
    if (!Array.isArray(saved.groups)) throw new Error("Không đọc được mã booking đã lưu trong phiên này.");
    return saved.groups.map(group => readIds(group.join(",")));
  }
  function remember(bookings, owner) {
    if (session.owner() !== owner) throw new Error("Tài khoản đã thay đổi. Vui lòng đăng nhập lại.");
    const ids = bookings.map(booking => idOf(booking?.id));
    if (!ids.length || ids.some(id => id === null) || new Set(ids).size !== ids.length) throw new Error("API chưa trả mã booking hợp lệ. Vui lòng liên hệ khách sạn trước khi đặt lại.");
    const groups = receipts();
    groups.push(ids);
    window.sessionStorage.setItem(key, JSON.stringify({ owner, groups }));
    return ids;
  }
  function assertKnown(ids) {
    const known = new Set(receipts().flat());
    if (!ids.every(id => known.has(id))) throw new Error("Booking này không nằm trong các lượt đặt của phiên đăng nhập hiện tại. Vui lòng mở từ Booking của tôi.");
  }
  function selection(params) {
    const roomIds = readIds(params.get("roomIds"));
    const checkIn = params.get("checkIn") || "", checkOut = params.get("checkOut") || "";
    const errors = window.RoomSearchValidation.validate({ checkIn, checkOut, guests: "1", roomType: "" });
    if (Object.keys(errors).length) throw new Error(Object.values(errors).join(" "));
    return { room_ids: roomIds, check_in_date: checkIn, check_out_date: checkOut };
  }
  async function selectedRooms(payload) {
    const data = await api.request("/rooms/available?" + new URLSearchParams({ check_in_date: payload.check_in_date, check_out_date: payload.check_out_date }));
    const selected = payload.room_ids.map(id => data.rooms.find(room => Number(room.id) === id));
    if (selected.some(room => !room)) throw new Error("Có phòng đã hết chỗ. Vui lòng tìm và chọn lại phòng.");
    return selected;
  }
  async function create(payload) {
    const owner = session.owner();
    if (!owner) throw new Error("Vui lòng đăng nhập trước khi đặt phòng.");
    // One request preserves the backend transaction for all selected rooms.
    let result;
    try { result = await api.request("/bookings", { method: "POST", body: payload }); }
    catch (error) {
      if (!error.status || error.status >= 500) {
        error.message = "Chưa xác định được máy chủ đã tạo booking hay chưa. Không gửi lại ngay; vui lòng liên hệ khách sạn để kiểm tra.";
        error.bookingUncertain = true;
      }
      throw error;
    }
    const bookings = Array.isArray(result) ? result : [result];
    try { return { bookings, ids: remember(bookings, owner) }; }
    catch {
      const error = new Error("Máy chủ đã nhận yêu cầu đặt phòng nhưng chưa lưu được mã vào phiên này. Không gửi lại; vui lòng liên hệ khách sạn. " + bookings.map(booking => booking?.booking_code || booking?.id || "").join(", "));
      error.bookingCreated = true;
      throw error;
    }
  }
  async function load(ids) {
    assertKnown(ids);
    const owner = session.owner();
    const bookings = await Promise.all(ids.map(id => api.request("/bookings/" + id)));
    if (owner !== session.owner()) throw new Error("Tài khoản đã thay đổi. Vui lòng đăng nhập lại.");
    for (let index = 0; index < ids.length; index++) {
      if (Number(bookings[index].id) !== ids[index] || (bookings[index].user_id != null && String(bookings[index].user_id) !== owner)) throw new Error("Không thể mở booking thuộc tài khoản khác.");
    }
    return bookings;
  }
  async function list() {
    const ids = [...new Set(receipts().flat())];
    return ids.length ? load(ids) : [];
  }
  async function invoice(booking) {
    assertKnown([Number(booking.id)]);
    let invoiceId = booking.invoice?.id || booking.invoice_id;
    if (!invoiceId && booking.booking_code) {
      let matches;
      try { matches = await api.request("/invoices?" + new URLSearchParams({ search: booking.booking_code })); }
      catch (error) { if (![403, 404].includes(error.status)) throw error; }
      if (matches !== undefined && !Array.isArray(matches)) throw new Error("Khách sạn chưa trả danh sách hóa đơn hợp lệ.");
      invoiceId = matches?.find(item => Number(item.booking_id) === Number(booking.id))?.id;
    }
    if (invoiceId) {
      const issued = await api.request("/invoices/" + invoiceId);
      if (Number(issued.booking_id) !== Number(booking.id)) throw new Error("Hóa đơn không khớp booking.");
      return { booking: issued.booking || booking, invoice: issued, invoice_items: issued.invoice_items || issued.items || [], charges: issued, detailAvailable: Array.isArray(issued.invoice_items) || Array.isArray(issued.items) };
    }
    const query = booking.actual_checkout_at ? "?" + new URLSearchParams({ checkout_time: booking.actual_checkout_at }) : "";
    const preview = await api.request("/bookings/" + booking.id + "/invoice/preview" + query);
    if (!preview?.charges || typeof preview.charges !== "object") throw new Error("Khách sạn chưa trả đầy đủ tổng hợp hóa đơn.");
    return { booking, invoice: null, invoice_items: preview.invoice_items || [], charges: preview.charges, detailAvailable: Array.isArray(preview.invoice_items), orders: preview.unpaid_service_orders || [] };
  }
  async function orders(booking) {
    assertKnown([Number(booking.id)]);
    // GET /service-orders is staff-only; the Guest-readable preview includes room charges.
    const preview = await api.request("/bookings/" + booking.id + "/invoice/preview");
    return preview.unpaid_service_orders || [];
  }
  async function order(booking, allocation, items, notes) {
    assertKnown([Number(booking.id)]);
    if (booking.status !== "checked_in" || !api.allocations(booking).some(room => String(room.room_id) === String(allocation.room_id) && String(room.id) === String(allocation.id))) throw new Error("Vui lòng chọn phòng đang lưu trú trong booking này.");
    return api.request("/service-orders", { method: "POST", body: {
      booking_id: Number(booking.id), room_id: Number(allocation.room_id),
      ...(allocation.id == null ? {} : { booking_room_id: Number(allocation.id) }),
      items, charge_to_room: true, notes,
    } });
  }
  window.GuestReservations = Object.freeze({ key, readIds, receipts, selection, selectedRooms, create, load, list, invoice, orders, order });
})();
