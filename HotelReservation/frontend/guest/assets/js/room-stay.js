"use strict";

(() => {
  const data = window.HotelRooms;
  const shared = window.RoomSearchValidation;
  if (!data || !shared) return;
  function nights(checkIn, checkOut) {
    if (!shared.parseDate(checkIn) || !shared.parseDate(checkOut)) return null;
    function dayNumber(value) {
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(0);
      date.setUTCFullYear(year, month - 1, day);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime() / 86400000;
    }
    // Calendar-day ordinals, not elapsed local hours (which change across DST).
    const count = dayNumber(checkOut) - dayNumber(checkIn);
    return count > 0 ? count : null;
  }
  function extraErrors(criteria, room, required = true) {
    const errors = {};
    if (!criteria.roomCount && !criteria.roomCountBadInput) {
      if (required) errors.roomCount = "Vui lòng nhập số phòng.";
      return errors;
    }
    if (criteria.roomCountBadInput || !shared.positiveInteger(criteria.roomCount)) {
      errors.roomCount = "Số phòng phải là số nguyên dương.";
      return errors;
    }
    if (!room) return errors;
    const availability = data.availability(room, criteria.checkIn, criteria.checkOut);
    const minimum = data.roomsNeeded(room, criteria.guests);
    if (availability?.count === 0) errors.roomCount = "Hết phòng trong khoảng ngày đã chọn";
    else if (minimum && Number(criteria.roomCount) < minimum) errors.roomCount = `Vui lòng chọn tối thiểu ${minimum} phòng để đủ chỗ cho ${Number(criteria.guests)} khách.`;
    else if (availability && Number(criteria.roomCount) > availability.count) errors.roomCount = `Số phòng yêu cầu vượt quá ${availability.count} phòng còn trống.`;
    return errors;
  }
  function validate(criteria, room, required = true) {
    const errors = { ...shared.validate(criteria, { required }), ...extraErrors(criteria, room, required) };
    if (!room) errors.roomType = "Không tìm thấy loại phòng";
    return errors;
  }
  function quote(criteria, room) {
    const dates = shared.validate({ ...criteria, guests: "", roomType: room?.id || "" }, { required: false });
    const count = nights(criteria.checkIn, criteria.checkOut);
    if (!room || dates.checkIn || dates.checkOut || !count || !shared.positiveInteger(criteria.roomCount)) return null;
    const amount = room.price * Number(criteria.roomCount) * count;
    return Number.isSafeInteger(amount) ? { nights: count, rooms: Number(criteria.roomCount), amount } : null;
  }
  function read(search) {
    const criteria = data.readSearch(search);
    criteria.roomCount = new URLSearchParams(search).get("roomCount") || "";
    return criteria;
  }
  function paramsFor(criteria, context = new URLSearchParams()) {
    const params = data.paramsFor(criteria);
    if (shared.positiveInteger(criteria.roomCount)) params.set("roomCount", String(Number(criteria.roomCount)));
    // Preserve only a validated list-filter value, never an arbitrary return URL.
    const listRoomType = context.get("listRoomType");
    if (listRoomType !== null && (listRoomType === "" || data.find(listRoomType))) params.set("listRoomType", listRoomType);
    return params;
  }
  window.RoomStay = Object.freeze({ nights, extraErrors, validate, quote, read, paramsFor });
})();
