"use strict";

(() => {
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
  function validate(criteria, { required = true, roomTypes = ["", "standard", "deluxe", "family", "suite"] } = {}) {
    const errors = {};
    const start = parseDate(criteria.checkIn);
    const end = parseDate(criteria.checkOut);
    const datesRequired = required || Boolean(criteria.checkIn || criteria.checkOut);
    if (criteria.checkInBadInput) errors.checkIn = "Ngày nhận phòng không hợp lệ.";
    else if (!criteria.checkIn && datesRequired) errors.checkIn = "Vui lòng chọn ngày nhận phòng.";
    else if (criteria.checkIn && !start) errors.checkIn = "Ngày nhận phòng không hợp lệ.";
    else if (start && criteria.checkIn < dateKey(new Date())) errors.checkIn = "Ngày nhận phòng không được trước hôm nay.";
    if (criteria.checkOutBadInput) errors.checkOut = "Ngày trả phòng không hợp lệ.";
    else if (!criteria.checkOut && datesRequired) errors.checkOut = "Vui lòng chọn ngày trả phòng.";
    else if (criteria.checkOut && !end) errors.checkOut = "Ngày trả phòng không hợp lệ.";
    else if (start && end && end <= start) errors.checkOut = "Ngày trả phòng phải sau ngày nhận phòng.";
    if (criteria.guestsBadInput) errors.guests = "Số khách phải là số nguyên dương.";
    else if (!criteria.guests && required) errors.guests = "Vui lòng nhập số khách.";
    else if (criteria.guests && !positiveInteger(criteria.guests)) errors.guests = "Số khách phải là số nguyên dương.";
    if (!roomTypes.includes(criteria.roomType)) errors.roomType = "Vui lòng chọn loại phòng trong danh sách.";
    return errors;
  }

  // Shared rendering for search and stay-selection forms; optional stay checks
  // extend the same date/guest rules without registering a second set of listeners.
  function attach(form, fields, { onEdit = () => {}, getRoomType = () => "", validateExtra = () => ({}) } = {}) {
    const roomTypes = fields.roomType ? [...fields.roomType.options].map(option => option.value) : undefined;
    const checked = new Set();
    function read() {
      const criteria = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value.trim()]));
      if (!fields.roomType) criteria.roomType = getRoomType();
      for (const key of ["checkIn", "checkOut", "guests", "roomCount"]) {
        if (fields[key]) criteria[`${key}BadInput`] = Boolean(fields[key].validity?.badInput);
      }
      return criteria;
    }
    function setError(key, message = "") {
      const field = fields[key];
      const error = document.getElementById(`${field.id}-error`);
      field.setAttribute("aria-invalid", String(Boolean(message)));
      error.textContent = message;
      error.hidden = !message;
    }
    function showErrors(errors, touchAll = false) {
      Object.keys(fields).forEach(key => {
        setError(key, errors[key]);
        if (touchAll || errors[key]) checked.add(key);
      });
    }
    function updateDateBounds() {
      fields.checkIn.min = dateKey(new Date());
      const start = parseDate(fields.checkIn.value);
      if (start) {
        start.setDate(start.getDate() + 1);
        fields.checkOut.min = dateKey(start);
      } else fields.checkOut.removeAttribute("min");
    }
    function validateAll(criteria = read(), required = true) {
      updateDateBounds();
      const errors = { ...validate(criteria, { required, roomTypes }), ...validateExtra(criteria, required) };
      showErrors(errors, true);
      return errors;
    }
    function focusFirst(errors) {
      const key = Object.keys(fields).find(name => errors[name]);
      if (!key) return;
      fields[key].focus({ preventScroll: true });
      fields[key].scrollIntoView({ block: "center", behavior: "auto" });
    }
    Object.entries(fields).forEach(([key, field]) => {
      function edit() {
        updateDateBounds();
        const criteria = read();
        const errors = { ...validate(criteria, { roomTypes }), ...validateExtra(criteria, true) };
        if (checked.has(key)) setError(key, errors[key]);
        if (key === "checkIn" && (checked.has("checkOut") || fields.checkOut.value)) {
          checked.add("checkOut");
          setError("checkOut", errors.checkOut);
        }
        if (fields.roomCount && checked.has("roomCount") && ["checkIn", "checkOut", "guests"].includes(key)) {
          setError("roomCount", errors.roomCount);
        }
        // Preserve every entered value, including checkout when the relationship changes.
        onEdit(key);
      }
      field.addEventListener("input", edit);
      field.addEventListener("change", edit);
    });
    function reset() {
      checked.clear();
      showErrors({});
      updateDateBounds();
    }
    reset();
    return { read, validateAll, showErrors, focusFirst, reset, updateDateBounds };
  }
  window.RoomSearchValidation = Object.freeze({ dateKey, parseDate, positiveInteger, validate, attach });
})();
