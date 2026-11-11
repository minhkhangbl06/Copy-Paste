"use strict";
(() => {
  const list = document.getElementById("service-history-list"), bookings = window.BookingData, store = window.ServiceRequests;
  if (!list || !bookings || !store || list.dataset.initialized) return;
  list.dataset.initialized = "true";
  const select = document.getElementById("history-booking"), type = document.getElementById("history-type"), status = document.getElementById("history-status");
  const error = document.getElementById("history-error"), empty = document.getElementById("history-empty");
  const make = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const money = value => new Intl.NumberFormat("vi-VN").format(value) + " đ";
  const date = value => value ? new Date(value).toLocaleString("vi-VN") : "Chưa có thông tin";
  const timing = request => request.schedule?.mode === "scheduled" ? request.schedule.date.split("-").reverse().join("/") + " · " + request.schedule.time : request.schedule?.mode === "asap" ? "Sớm nhất có thể" : "Chưa có thông tin";
  const group = code => code === "PENDING" ? "waiting" : ["ACCEPTED", "CLEANING", "PROCESSING", "CONFIRMED"].includes(code) ? "active" : code === "COMPLETED" ? "completed" : code === "CANCELLED" ? "cancelled" : "";
  let selectedReference = new URLSearchParams(location.search).get("reference") || "";
  function render() {
    // Read-only projection of the existing booking and service stores. No new
    // seeds, ownership flags, invoice totals or request transitions are created.
    const saved = bookings.load();
    select.replaceChildren(make("option", "Tất cả booking")); select.firstChild.value = "";
    for (const booking of saved.bookings) { const option = make("option", booking.reference + " · " + (window.HotelRooms.find(booking.stay.roomType)?.name || "")); option.value = booking.reference; select.append(option); }
    const wanted = selectedReference;
    const valid = !wanted || saved.bookings.some(b => b.reference === wanted);
    select.value = valid ? wanted : "";
    let failed = Boolean(saved.error), rows = [];
    if (valid) for (const booking of saved.bookings) {
      if (select.value && booking.reference !== select.value) continue;
      const requests = store.load(booking.reference); failed ||= Boolean(requests.error);
      for (const request of requests.requests) rows.push({booking, request});
    }
    const legacy = type.querySelector('option[value="transport"]'); legacy.hidden = !rows.some(({request}) => request.type === "transport");
    if (legacy.hidden && type.value === "transport") type.value = "";
    rows = rows.filter(({request:r}) => (!type.value || r.type === type.value) && (!status.value || group(r.status) === status.value));
    // Unknown fixture creation times stay unknown; known times sort newest first.
    rows.sort((a,b) => (Date.parse(b.request.createdAt) || 0) - (Date.parse(a.request.createdAt) || 0));
    error.textContent = !valid ? "Không tìm thấy booking bạn chọn." : failed ? "Không thể đọc đầy đủ lịch sử dịch vụ. Vui lòng thử lại." : ""; error.hidden = !error.textContent;
    list.replaceChildren(); empty.hidden = rows.length > 0;
    document.getElementById("history-count").textContent = rows.length + " yêu cầu dịch vụ";
    for (const {booking,request:r} of rows) {
      const card = make("article", undefined, "history-card"), heading = make("div", undefined, "history-card-heading"), title = make("div");
      title.append(make("h2", r.id + " — " + store.name(r.type)), make("p", booking.reference + " · " + (window.HotelRooms.find(booking.stay.roomType)?.name || ""), "history-booking"));
      heading.append(title, make("span", store.label(r), "history-status history-status-" + r.status)); card.append(heading);
      const facts = make("dl", undefined, "history-facts");
      function pair(label, value, wide=false) { const row = make("div", undefined, wide ? "history-wide" : ""); row.append(make("dt", label), make("dd", value)); facts.append(row); }
      pair("Thời điểm tạo", date(r.createdAt));
      if (r.type === "housekeeping") { pair("Phòng cần dọn", r.roomNumber); pair("Thời gian mong muốn", timing(r)); }
      if (r.type === "laundry") {
        pair("Nhân viên đến lấy đồ", timing(r));
        pair("Khối lượng đã cân", r.weightConfirmed === null ? "Chờ cân xác nhận" : r.weightConfirmed + " kg");
        if (!["COMPLETED","CANCELLED"].includes(r.status)) pair("Dự kiến trả đồ sạch", r.returnExpectedAt ? date(r.returnExpectedAt) : "Chờ khách sạn xác nhận");
      }
      if (r.type === "transport") { pair("Điểm đón", r.pickup); pair("Điểm đến", r.destination); pair("Lịch mong muốn", timing(r)); }
      const cost = r.type === "housekeeping" ? "Đã bao gồm trong tiền phòng" : r.status === "CANCELLED" ? "Không tính vào tổng" : r.costConfirmed !== null ? money(r.costConfirmed) : Number.isSafeInteger(r.orderTotal) ? money(r.orderTotal) + " · Chờ tiếp nhận" : "Chờ xác nhận";
      pair(r.type === "food" ? "Tiền món" : "Chi phí", cost);
      if (r.note) pair("Ghi chú", r.note, true);
      if (r.cancelledAt) pair("Thời điểm hủy", date(r.cancelledAt));
      card.append(facts);
      if (r.items?.length) {
        const items = make("ul", undefined, "history-items");
        for (const item of r.items) {
          const row = make("li"); row.append(make("span", item.name + " × " + item.quantity));
          if (r.status !== "CANCELLED") row.append(make("span", money(item.lineTotal ?? item.quantity * item.unitPrice)));
          items.append(row);
        }
        card.append(items);
      }
      const actions = make("div", undefined, "history-actions");
      const service = make("a", "Xem yêu cầu", "button button-outline");
      const url = bookings.entryURL("services.html", booking, location.href); url.searchParams.set("request", r.id); url.hash = "service-" + r.id; service.href = url.href;
      const detail = make("a", "Chi tiết booking", "button button-outline"); detail.href = bookings.entryURL("booking-detail.html", booking, location.href).href;
      actions.append(service, detail); card.append(actions); list.append(card);
    }
  }
  select.addEventListener("change", () => { selectedReference = select.value; render(); });
  [type,status].forEach(field => field.addEventListener("change", render));
  window.addEventListener("pageshow", render); window.addEventListener("copyPasteHotel:sessionchange", render); render();
})();