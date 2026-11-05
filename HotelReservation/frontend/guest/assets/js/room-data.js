"use strict";

(() => {
  // Shared UI samples from the existing cards/specification. Availability is fixed,
  // NOT computed for dates: M3 availability must replace these counts/prices and
  // validate allocation when integrated. No confirmed per-type photos/amenity list.
  const image = "../assets/images/khach-san-da-lat.jpg";
  const rooms = Object.freeze([
    { id: "standard", name: "Standard", capacity: "2 khách", maxGuests: 2, price: 500000, available: 6,
      description: "Không gian gọn gàng, thoải mái cho chuyến đi hai người.",
      feature: "Giường đôi hoặc 2 giường đơn", view: "", image },
    { id: "deluxe", name: "Deluxe", capacity: "2–3 khách", maxGuests: 3, price: 800000, available: 4,
      description: "Thêm không gian để thư giãn và tận hưởng kỳ nghỉ.",
      subtitle: "Không gian rộng hơn để thư giãn và tận hưởng kỳ nghỉ.",
      introduction: "Deluxe mang đến không gian thoải mái cho chuyến đi hai người hoặc nhóm nhỏ, phù hợp để nghỉ ngơi và thư giãn trong thời gian lưu trú.",
      feature: "Diện tích lớn hơn, view đẹp", view: "View đẹp", image },
    { id: "family", name: "Family", capacity: "4 khách", maxGuests: 4, price: 1200000, available: 2,
      description: "Không gian để cả gia đình cùng nghỉ ngơi bên nhau.",
      feature: "2 phòng ngủ hoặc giường phụ", view: "", image },
    { id: "suite", name: "Suite", capacity: "2–4 khách", maxGuests: 4, price: 1500000, available: 1,
      description: "Không gian riêng tư cho một kỳ nghỉ thư thái.",
      feature: "Phòng khách riêng, tiện nghi cao cấp", view: "", image },
  ].map(Object.freeze));
  const sorts = new Set(["default", "price-asc", "price-desc"]);
  const find = id => rooms.find(room => room.id === id);
  const dateKey = date => `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return year > 0 && dateKey(date) === value ? date : null;
  }
  const positiveInteger = value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  function readSearch(search) {
    const params = new URLSearchParams(search);
    return {
      checkIn: params.get("checkIn") || "",
      checkOut: params.get("checkOut") || "",
      guests: params.get("guests") || "",
      roomType: params.get("roomType") || "",
      sort: params.get("sort") || "default",
    };
  }
  function validate(criteria, requireGuests = false) {
    const errors = {};
    const start = parseDate(criteria.checkIn);
    const end = parseDate(criteria.checkOut);
    if (criteria.checkIn || criteria.checkOut) {
      if (!criteria.checkIn) errors.checkIn = "Vui lòng chọn ngày nhận phòng.";
      else if (!start) errors.checkIn = "Ngày nhận phòng không hợp lệ.";
      else if (criteria.checkIn < dateKey(new Date())) errors.checkIn = "Ngày nhận phòng không được trước hôm nay.";
      if (!criteria.checkOut) errors.checkOut = "Vui lòng chọn ngày trả phòng.";
      else if (!end) errors.checkOut = "Ngày trả phòng không hợp lệ.";
      else if (start && end <= start) errors.checkOut = "Ngày trả phòng phải sau ngày nhận phòng.";
    }
    // Both pages currently use an uncapped number input, not a fixed guest option list.
    if ((requireGuests || criteria.guests !== "") && !positiveInteger(criteria.guests)) {
      errors.guests = "Vui lòng nhập số khách là số nguyên dương hợp lệ.";
    }
    if (criteria.roomType && !find(criteria.roomType)) errors.roomType = "Vui lòng chọn loại phòng trong danh sách.";
    if (!sorts.has(criteria.sort)) errors.sort = "Lựa chọn sắp xếp không hợp lệ.";
    return errors;
  }
  function paramsFor(criteria) {
    const params = new URLSearchParams();
    if (parseDate(criteria.checkIn)) params.set("checkIn", criteria.checkIn);
    if (parseDate(criteria.checkOut)) params.set("checkOut", criteria.checkOut);
    if (positiveInteger(criteria.guests)) params.set("guests", String(Number(criteria.guests)));
    if (find(criteria.roomType)) params.set("roomType", criteria.roomType);
    if (sorts.has(criteria.sort) && criteria.sort !== "default") params.set("sort", criteria.sort);
    return params;
  }
  const roomsNeeded = (room, guests) => positiveInteger(guests) ? Math.ceil(Number(guests) / room.maxGuests) : null;
  function availability(room, checkIn, checkOut) {
    const start = parseDate(checkIn);
    const end = parseDate(checkOut);
    if (!room || !start || !end || end <= start || checkIn < dateKey(new Date())) return null;
    // Same fixed fixture for every valid date range, not date-based inventory.
    // Recompute the context on every date edit. M3 must supply real dated availability.
    return { count: room.available, checkIn, checkOut, source: "fixed-sample" };
  }
  function results(criteria) {
    const result = rooms.filter(room => (!criteria.roomType || room.id === criteria.roomType) &&
      (roomsNeeded(room, criteria.guests) || 1) <= room.available);
    if (criteria.sort === "price-asc") result.sort((a, b) => a.price - b.price);
    if (criteria.sort === "price-desc") result.sort((a, b) => b.price - a.price);
    return result;
  }
  window.HotelRooms = Object.freeze({ rooms, find, dateKey, parseDate, positiveInteger, readSearch, validate, paramsFor, roomsNeeded, availability, results });
})();
