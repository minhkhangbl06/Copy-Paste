"use strict";

(() => {
  const data = window.HotelRooms;
  const shared = window.RoomSearchValidation;
  const stay = window.RoomStay;
  const main = document.querySelector(".room-detail-main");
  if (!main || !data || !shared || !stay || main.dataset.initialized) return;
  main.dataset.initialized = "true";
  const form = document.getElementById("room-detail-form");
  const fields = {
    checkIn: document.getElementById("check-in"),
    checkOut: document.getElementById("check-out"),
    guests: document.getElementById("guests"),
    roomCount: document.getElementById("room-count"),
  };
  const content = document.querySelector(".room-detail-content");
  const estimate = document.getElementById("room-detail-estimate");
  const money = new Intl.NumberFormat("vi-VN");
  const dialog = document.getElementById("room-gallery-dialog");
  let room = null;
  let context = new URLSearchParams();
  let initial = {};
  let imageOpener = null;
  const validation = shared.attach(form, fields, {
    getRoomType: () => room?.id || "",
    validateExtra: (criteria, required) => stay.extraErrors(criteria, room, required),
    onEdit: updateSelection,
  });
  function selected() {
    return { ...validation.read(), sort: initial.sort || "default" };
  }
  function updateSelection() {
    if (!room) return;
    const criteria = selected();
    const availability = data.availability(room, criteria.checkIn, criteria.checkOut);
    document.querySelector(".room-detail-availability").textContent = availability
      ? availability.count === 0 ? "Hết phòng trong khoảng ngày đã chọn" : `Còn ${availability.count} phòng`
      : "Chọn ngày để kiểm tra phòng trống";
    const quote = stay.quote(criteria, room);
    estimate.hidden = !quote;
    if (quote) {
      estimate.querySelector('[data-estimate="nights"]').textContent = `${quote.nights} đêm`;
      estimate.querySelector('[data-estimate="rooms"]').textContent = `${quote.rooms} phòng`;
      estimate.querySelector('[data-estimate="amount"]').textContent = `${money.format(quote.amount)} đ`;
    }
  }
  function render() {
    context = new URLSearchParams(window.location.search);
    initial = stay.read(window.location.search);
    room = data.find(context.has("roomType") ? initial.roomType : "deluxe");
    const listRoomType = context.get("listRoomType");
    const back = new URL("rooms.html", window.location.href);
    back.search = data.paramsFor({ ...initial,
      roomType: listRoomType !== null && (listRoomType === "" || data.find(listRoomType)) ? listRoomType : initial.roomType,
    }).toString();
    back.hash = "";
    document.querySelector(".room-detail-back").href = back.href;
    content.hidden = !room;
    document.getElementById("room-detail-message").hidden = true;
    if (dialog.open) dialog.close();
    if (!room) {
      document.title = "Không tìm thấy loại phòng - Copy Paste Hotel";
      document.querySelector('meta[name="description"]').content = "Loại phòng bạn chọn không tồn tại.";
      document.querySelector(".room-detail-heading h1").textContent = "Không tìm thấy loại phòng";
      document.querySelector(".room-detail-subtitle").textContent = "Loại phòng bạn chọn không tồn tại.";
      return;
    }
    initial.roomType = room.id;
    document.title = `${room.name} - Copy Paste Hotel`;
    document.querySelector('meta[name="description"]').content = `${room.name} - ${room.description}`;
    document.querySelector(".room-detail-heading h1").textContent = room.name;
    document.querySelector(".room-detail-subtitle").textContent = room.subtitle || room.description;
    document.querySelector(".room-detail-description > p:last-child").textContent = room.introduction || room.description;
    document.querySelector(".room-detail-gallery").setAttribute("aria-label", `Hình ảnh loại phòng ${room.name}`);
    document.querySelectorAll(".room-detail-image-open").forEach(button => {
      button.setAttribute("aria-label", `Xem ảnh lớn loại phòng ${room.name}`);
    });
    document.querySelectorAll(".room-detail-gallery img").forEach((image, index) => {
      image.src = room.image;
      image.alt = index === 0 ? `Không gian phòng nghỉ minh họa cho loại ${room.name}` : "";
    });
    const facts = document.querySelector(".room-detail-facts");
    facts.replaceChildren();
    const rows = [["Sức chứa", room.capacity], ["Đặc điểm nổi bật", room.feature]];
    if (room.view) rows.push(["Hướng nhìn", room.view]);
    // No unconfirmed bed layouts, views or additional amenities are invented.
    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      row.append(dt, dd);
      facts.append(row);
    });
    const currency = document.createElement("span");
    currency.textContent = "đ";
    document.querySelector(".room-detail-price").replaceChildren(`${new Intl.NumberFormat("vi-VN").format(room.price)} `, currency);

    for (const key of ["checkIn", "checkOut", "guests"]) fields[key].value = initial[key];
    if (!context.has("roomCount")) initial.roomCount = String(Math.max(1, data.roomsNeeded(room, initial.guests) || 1));
    fields.roomCount.value = initial.roomCount;
    validation.reset();
    const errors = stay.validate(initial, room, false);
    if (context.has("roomCount") && !initial.roomCount) errors.roomCount = "Vui lòng nhập số phòng.";
    validation.showErrors(errors);
    updateSelection();
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!room) return;
    const criteria = selected();
    const errors = validation.validateAll(criteria);
    if (Object.keys(errors).length) {
      validation.focusFirst(errors);
      return;
    }
    const destination = new URL("booking.html", window.location.href);
    destination.search = stay.paramsFor(criteria, context).toString();
    destination.hash = "";
    // Criteria only; this does not create/hold/confirm a booking or payment.
    window.location.assign(destination.href);
  });
  document.querySelectorAll(".room-detail-image-open").forEach(button => {
    button.addEventListener("click", () => {
      if (!room || dialog.open) return;
      imageOpener = button;
      const image = document.getElementById("room-gallery-image");
      image.src = room.image;
      image.alt = `Không gian phòng nghỉ minh họa cho loại ${room.name}`;
      document.getElementById("room-gallery-title").textContent = `Ảnh loại phòng ${room.name}`;
      dialog.showModal();
      document.getElementById("room-gallery-close").focus({ preventScroll: true });
    });
  });
  document.getElementById("room-gallery-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => { event.preventDefault(); dialog.close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => { if (imageOpener && !content.hidden) imageOpener.focus({ preventScroll: true }); });
  window.addEventListener("popstate", render);
  render();
})();
