"use strict";

(() => {
  const data = window.HotelRooms;
  const stay = window.RoomStay;
  const drafts = window.BookingDraft;
  const content = document.querySelector(".booking-content");
  if (!data || !stay || !drafts || !content || content.dataset.initialized) return;
  content.dataset.initialized = "true";
  const money = new Intl.NumberFormat("vi-VN");
  const fields = {
    fullName: document.getElementById("full-name"),
    email: document.getElementById("email"),
    phone: document.getElementById("phone"),
    specialRequest: document.getElementById("special-request"),
  };
  const checked = new Set();
  const formMessage = document.getElementById("booking-form-error");
  function readContact() {
    return { fullName: fields.fullName.value, email: fields.email.value, phone: fields.phone.value };
  }
  function setError(key, message = "") {
    const field = fields[key];
    const error = document.getElementById(`${field.id}-error`);
    field.setAttribute("aria-invalid", String(Boolean(message)));
    error.textContent = message;
    error.hidden = !message;
  }
  function showStayState(errors, valid) {
    content.hidden = !valid;
    document.getElementById("booking-invalid").hidden = valid;
    document.getElementById("booking-invalid-reason").textContent = valid ? "" : Object.values(errors).join(" ");
  }
  function render() {
    const criteria = stay.read(window.location.search);
    const context = new URLSearchParams(window.location.search);
    const room = data.find(criteria.roomType);
    const errors = stay.validate(criteria, room);
    const quote = stay.quote(criteria, room);
    const valid = Object.keys(errors).length === 0 && Boolean(quote);
    showStayState(errors, valid);
    const back = new URL(room ? "room-detail.html" : "rooms.html", window.location.href);
    back.search = stay.paramsFor(criteria, context).toString();
    back.hash = "";
    const link = document.querySelector(".booking-back");
    link.href = back.href;
    link.textContent = room ? "← Về chi tiết loại phòng" : "← Về danh sách phòng";
    checked.clear();
    formMessage.hidden = true;
    Object.keys(fields).forEach(key => { fields[key].value = ""; setError(key); });
    if (!valid) return;
    document.querySelector('meta[name="description"]').content = `Thông tin lưu trú và liên hệ cho lựa chọn phòng ${room.name} tại Copy Paste Hotel.`;
    document.querySelector("[data-booking-room-name]").textContent = room.name;
    const image = document.querySelector(".booking-room-image img");
    image.src = room.image;
    image.alt = `Không gian phòng nghỉ minh họa cho loại ${room.name}`;
    for (const key of ["checkIn", "checkOut"]) {
      const time = document.querySelector(`[data-stay="${key}"]`);
      time.dateTime = criteria[key];
      time.textContent = criteria[key].split("-").reverse().join("/");
    }
    const labels = { nights: `${quote.nights} đêm`, guests: `${Number(criteria.guests)} khách`, roomCount: `${quote.rooms} phòng` };
    Object.entries(labels).forEach(([key, value]) => { document.querySelector(`[data-stay="${key}"]`).textContent = value; });
    const summary = {
      roomType: room.name,
      unitPrice: `${money.format(room.price)} đ/đêm`,
      roomCount: labels.roomCount,
      nights: labels.nights,
    };
    Object.entries(summary).forEach(([key, value]) => { document.querySelector(`[data-summary="${key}"]`).textContent = value; });
    document.querySelector(".booking-price-breakdown").textContent = `${money.format(room.price)} đ × ${quote.rooms} phòng × ${quote.nights} đêm`;
    const currency = document.createElement("span");
    currency.textContent = "đ";
    document.getElementById("booking-total").replaceChildren(`${money.format(quote.amount)} `, currency);
    // Restore contact only for this exact selected stay; never replace URL criteria.
    const saved = drafts.load();
    if (saved.draft && drafts.matches(saved.draft, criteria)) {
      Object.entries(saved.draft.contact).forEach(([key, value]) => { fields[key].value = value; });
      fields.specialRequest.value = saved.draft.specialRequest;
    } else if (saved.error === "unavailable") {
      formMessage.textContent = "Không thể khôi phục thông tin đã nhập. Vui lòng nhập lại.";
      formMessage.hidden = false;
    }
  }
  Object.entries(fields).forEach(([key, field]) => {
    field.addEventListener("input", () => {
      if (checked.has(key)) setError(key, drafts.contactErrors(readContact(), fields.specialRequest.value)[key]);
      formMessage.hidden = true;
    });
  });
  content.addEventListener("submit", event => {
    event.preventDefault();
    const criteria = stay.read(window.location.search);
    const room = data.find(criteria.roomType);
    const stayErrors = stay.validate(criteria, room);
    const quote = stay.quote(criteria, room);
    const contact = readContact();
    const errors = drafts.contactErrors(contact, fields.specialRequest.value);
    Object.keys(fields).forEach(key => { checked.add(key); setError(key, errors[key]); });
    formMessage.hidden = true;
    if (Object.keys(stayErrors).length || !quote) {
      showStayState(stayErrors, false);
      document.querySelector("#booking-invalid a").focus();
      return;
    }
    const first = Object.keys(fields).find(key => errors[key]);
    if (first) {
      fields[first].focus({ preventScroll: true });
      fields[first].scrollIntoView({ block: "center", behavior: "auto" });
      return;
    }
    const draft = drafts.create(criteria, contact, fields.specialRequest.value, new URLSearchParams(window.location.search));
    if (!draft || !drafts.save(draft)) {
      formMessage.textContent = "Không thể lưu thông tin để tiếp tục. Vui lòng thử lại.";
      formMessage.hidden = false;
      formMessage.focus({ preventScroll: true });
      return;
    }
    // No personal data in URL. No booking, hold or payment is created here.
    window.location.assign(new URL("booking-payment.html", window.location.href).href);
  });
  window.addEventListener("popstate", render);
  render();
})();
