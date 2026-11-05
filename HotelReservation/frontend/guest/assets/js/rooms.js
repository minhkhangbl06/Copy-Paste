"use strict";

(() => {
  const form = document.getElementById("rooms-search-form");
  const data = window.HotelRooms;
  const shared = window.RoomSearchValidation;
  if (!form || !data || !shared || form.dataset.initialized) return;
  form.dataset.initialized = "true";
  const fields = {
    checkIn: document.getElementById("check-in"),
    checkOut: document.getElementById("check-out"),
    guests: document.getElementById("guests"),
    roomType: document.getElementById("room-type"),
    sort: document.getElementById("room-sort"),
  };
  const list = document.querySelector(".room-results-list");
  const template = document.getElementById("room-result-template");
  const count = document.getElementById("rooms-result-count");
  const empty = document.getElementById("rooms-empty");
  const money = new Intl.NumberFormat("vi-VN");
  let searchAttempted = false;
  const { sort, ...searchFields } = fields;
  const validation = shared.attach(form, searchFields, { onEdit: invalidateAvailability });

  function readForm() {
    return { ...validation.read(), sort: sort.value };
  }
  function sortError(message = "") {
    const error = document.getElementById("room-sort-error");
    sort.setAttribute("aria-invalid", String(Boolean(message)));
    error.textContent = message;
    error.hidden = !message;
  }
  const sortValid = value => ["default", "price-asc", "price-desc"].includes(value);
  const searchIntent = criteria => Boolean(criteria.checkIn || criteria.checkOut || criteria.guests ||
    criteria.checkInBadInput || criteria.checkOutBadInput || criteria.guestsBadInput);
  function invalidateAvailability() {
    list.querySelectorAll(".room-availability").forEach(badge => {
      badge.textContent = "Chọn ngày để kiểm tra phòng trống";
    });
    list.querySelectorAll("[data-room-needed-label], [data-room-needed]").forEach(element => { element.hidden = true; });
    if (list.children.length) count.textContent = `${list.children.length} loại phòng`;
  }
  function render(criteria, errors = {}) {
    list.replaceChildren();
    const invalid = Object.keys(errors).length > 0;
    const stayApplied = !invalid && Object.keys(shared.validate(criteria)).length === 0;
    // Browsing is allowed without dates. Do not apply inventory counts to that view.
    const rooms = invalid ? [] : data.results(stayApplied ? criteria : { ...criteria, guests: "" });
    count.textContent = invalid ? "" : `${rooms.length} loại phòng${stayApplied ? " phù hợp" : ""}`;
    empty.hidden = rooms.length > 0;
    empty.textContent = invalid ? "Vui lòng kiểm tra lại tiêu chí tìm phòng." :
      "Không tìm thấy loại phòng phù hợp với lựa chọn của bạn.";
    rooms.forEach(room => {
      const card = template.content.firstElementChild.cloneNode(true);
      const title = card.querySelector("h3");
      title.id = `${room.id}-title`;
      title.textContent = room.name;
      card.setAttribute("aria-labelledby", title.id);
      const image = card.querySelector("img");
      image.src = room.image;
      image.alt = `Không gian nghỉ ngơi minh họa cho loại ${room.name}`;
      card.querySelector(".room-result-info > p").textContent = room.description;
      card.querySelector("[data-room-capacity]").textContent = room.capacity;
      card.querySelector("[data-room-feature]").textContent = room.feature;
      const availability = stayApplied ? data.availability(room, criteria.checkIn, criteria.checkOut) : null;
      card.querySelector(".room-availability").textContent = availability ? `Còn ${availability.count} phòng` :
        "Chọn ngày để kiểm tra phòng trống";
      const needed = stayApplied ? data.roomsNeeded(room, criteria.guests) : null;
      const neededValue = card.querySelector("[data-room-needed]");
      card.querySelector("[data-room-needed-label]").hidden = needed === null;
      neededValue.hidden = needed === null;
      neededValue.textContent = needed === null ? "" : `${needed} phòng`;
      const currency = document.createElement("span");
      currency.textContent = "đ";
      card.querySelector(".room-result-price").replaceChildren(`${money.format(room.price)} `, currency);
      const params = data.paramsFor({ ...criteria, roomType: room.id });
      // Preserve the list's filter separately from the room being inspected.
      params.set("listRoomType", criteria.roomType);
      if (needed !== null) params.set("roomCount", String(needed));
      const destination = new URL("room-detail.html", window.location.href);
      destination.search = params.toString();
      destination.hash = "";
      const link = card.querySelector("a");
      link.href = destination.href;
      link.setAttribute("aria-label", `Xem chi tiết loại phòng ${room.name}`);
      list.append(card);
    });
  }
  function apply({ required = false, focusError = false } = {}) {
    const criteria = readForm();
    const errors = validation.validateAll(criteria, required || searchAttempted || searchIntent(criteria));
    if (!sortValid(criteria.sort)) errors.sort = "Lựa chọn sắp xếp không hợp lệ.";
    sortError(errors.sort);
    if (Object.keys(errors).length) {
      // Leave the last applied cards and URL intact; draft changes are not results.
      invalidateAvailability();
      if (focusError) {
        if (Object.keys(errors).some(key => key !== "sort")) validation.focusFirst(errors);
        else sort.focus();
      }
      return;
    }
    render(criteria);
    const url = new URL(window.location.href);
    url.search = data.paramsFor(criteria).toString();
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
  }
  function restoreFromURL() {
    const criteria = data.readSearch(window.location.search);
    Object.entries(fields).forEach(([key, field]) => {
      // Native controls reject malformed values. Validate raw URL criteria separately
      // so an invalid value cannot silently turn into an unrestricted search.
      field.value = criteria[key];
    });
    validation.reset();
    searchAttempted = searchIntent(criteria);
    const errors = shared.validate(criteria, { required: searchAttempted });
    if (!sortValid(criteria.sort)) errors.sort = "Lựa chọn sắp xếp không hợp lệ.";
    validation.showErrors(errors);
    sortError(errors.sort);
    render(criteria, errors);
    validation.updateDateBounds();
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    searchAttempted = true;
    apply({ required: true, focusError: true });
  });
  fields.sort.addEventListener("change", () => apply({ focusError: true }));
  document.getElementById("rooms-clear-filters").addEventListener("click", () => {
    fields.roomType.value = "";
    fields.sort.value = "default";
    apply({ focusError: true });
  });
  window.addEventListener("popstate", restoreFromURL);
  restoreFromURL();
})();
