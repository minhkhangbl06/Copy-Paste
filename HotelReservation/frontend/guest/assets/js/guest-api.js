"use strict";
(() => {
  async function request(path, { method = "GET", body, token = window.GuestSession?.token() } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(window.GUEST_API_BASE_URL.replace(/\/$/, "") + path, {
        method, signal: controller.signal, cache: "no-store",
        headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: "Bearer " + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error("Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.");
    } finally { clearTimeout(timeout); }
    let payload = null;
    if (response.status !== 204) {
      try { payload = await response.json(); }
      catch { throw new Error("Máy chủ trả về dữ liệu không hợp lệ."); }
    }
    if (!response.ok || payload?.status === "error") {
      if (response.status === 401 && token) window.GuestSession?.clear();
      const detail = payload?.errors ? Object.values(payload.errors).flat().join(" ") : "";
      const error = new Error(detail || payload?.message || "Yêu cầu thất bại. Vui lòng thử lại.");
      error.status = response.status;
      error.errors = payload?.errors;
      throw error;
    }
    return payload?.data ?? payload;
  }
  const date = value => typeof value === "string" ? value.slice(0, 10) : "";
  const money = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? "Chưa có thông tin" : new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(value));
  function allocations(booking) {
    if (Array.isArray(booking.booking_rooms) && booking.booking_rooms.length) return booking.booking_rooms;
    return booking.room ? [{ id: null, room_id: booking.room_id, room: booking.room, total_room_amount: booking.total_room_amount }] : [];
  }
  function groupItems(items, rooms) {
    const groups = rooms.map(room => ({ room, items: [] }));
    const common = { room: null, items: [] };
    for (const item of items) {
      const target = item.booking_room_id != null
        ? groups.find(group => String(group.room.id) === String(item.booking_room_id))
        : item.room_id != null ? groups.find(group => String(group.room.room_id) === String(item.room_id)) : null;
      (target || common).items.push(item);
    }
    if (common.items.length) groups.push(common);
    return groups;
  }
  const bookingLabels = { pending: "Chờ xác nhận", confirmed: "Đã xác nhận", checked_in: "Đang lưu trú", checked_out: "Đã trả phòng", cancelled: "Đã hủy" };
  const depositLabels = { unpaid: "Chưa nhận cọc", pending: "Chờ xác nhận cọc", paid: "Đã nhận cọc", confirmed: "Đã nhận cọc", partially_paid: "Đã nhận một phần cọc", refunded: "Đã hoàn cọc", not_required: "Không yêu cầu cọc" };
  window.GuestAPI = Object.freeze({ request, date, money, allocations, groupItems, bookingLabels, depositLabels });
})();
