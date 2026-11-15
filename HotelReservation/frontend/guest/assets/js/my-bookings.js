"use strict";

(() => {
  const list = document.querySelector(".my-bookings-list");
  const data = window.BookingData;
  const reviews = window.ReviewData;
  if (!list || !data || !reviews || list.dataset.initialized) return;
  list.dataset.initialized = "true";
  const template = document.getElementById("my-booking-template");
  const groups = [...document.querySelectorAll("[data-booking-filter]")];
  const badgeClasses = { PENDING: "pending", CONFIRMED: "confirmed", CHECKED_IN: "checked-in", CHECKED_OUT: "checked-out", CANCELLED: "cancelled" };
  const money = value => new Intl.NumberFormat("vi-VN").format(value) + " đ";
  function render() {
    const filter = data.normalizeFilter(new URLSearchParams(window.location.search).get("filter"));
    const saved = data.load();
    const reviewState = reviews.read();
    const bookings = saved.bookings.filter(item => data.matchesFilter(item, filter));
    const error = document.getElementById("my-bookings-error");
    error.hidden = !saved.error && !reviewState.error;
    error.textContent = [saved.error ? "Không thể đọc đầy đủ các booking đã lưu. Vui lòng thử lại." : "", reviewState.error ? "Không thể đọc đầy đủ đánh giá đã lưu. Vui lòng thử lại." : ""].filter(Boolean).join(" ");
    groups.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.bookingFilter === filter)));
    list.replaceChildren();
    document.getElementById("my-bookings-empty").hidden = bookings.length > 0;
    bookings.forEach(booking => {
      const card = template.content.firstElementChild.cloneNode(true);
      const selected = booking.stay;
      const room = window.HotelRooms.find(selected.roomType);
      const title = card.querySelector("h2");
      title.id = booking.reference.toLowerCase() + "-title";
      title.textContent = booking.reference;
      const codeLabel = document.createElement("span");
      codeLabel.textContent = "Mã đặt phòng";
      title.prepend(codeLabel);
      card.setAttribute("aria-labelledby", title.id);
      const badge = card.querySelector(".my-booking-status");
      badge.className = "my-booking-status my-booking-status-" + (badgeClasses[booking.bookingStatus] || "pending");
      badge.textContent = data.labels[booking.bookingStatus] || booking.bookingStatus;
      card.querySelector(".my-booking-room-name h3").textContent = room.name;
      const image = card.querySelector("img");
      image.src = room.image;
      image.alt = "Không gian phòng nghỉ minh họa cho loại " + room.name;
      const values = [selected.checkIn.split("-").reverse().join("/"), selected.checkOut.split("-").reverse().join("/"),
        window.RoomStay.nights(selected.checkIn, selected.checkOut) + " đêm", selected.guests + " khách", selected.roomCount + " phòng"];
      card.querySelectorAll(".my-booking-facts dd").forEach((dd, index) => { dd.textContent = values[index]; });
      card.querySelector(".my-booking-money-label").textContent = booking.bookingStatus === "CANCELLED" ? "Tiền phòng trước hủy" : "Tiền phòng";
      card.querySelector(".my-booking-money").textContent = money(booking.roomAmount);
      const actions = card.querySelector(".my-booking-actions");
      function link(label, page, primary = false) {
        const a = document.createElement("a");
        a.className = "button " + (primary ? "button-primary" : "button-outline");
        a.href = data.entryURL(page, booking, window.location.href, filter).href;
        a.textContent = label;
        actions.append(a);
      }
      link("Xem chi tiết", "booking-detail.html", true);
      if (data.canPay(booking)) link("Tiếp tục thanh toán", "booking-payment.html");
      else if (data.canViewPayment(booking)) link("Xem thông tin thanh toán", "booking-payment.html");
      if (booking.bookingStatus === "CHECKED_OUT") {
        const reviewed = Boolean(reviewState.reviews[booking.reference]);
        link(reviewed ? "Xem đánh giá" : "Đánh giá kỳ lưu trú", "review.html");
        if (reviewed) { const label = document.createElement("span"); label.textContent = "Đã đánh giá"; actions.append(label); }
      }
      if (booking.paymentStatus) {
        const transfer = document.createElement("div");
        transfer.className = "my-booking-transfer";
        const lines = [data.paymentLabels[booking.paymentStatus]];
        if (booking.reportedAmount !== null) lines.push("Khách báo đã chuyển: " + money(booking.reportedAmount));
        if (booking.confirmedAmount !== null) lines.push("Đã thanh toán được xác nhận: " + money(booking.confirmedAmount));
        lines.forEach(text => { const p = document.createElement("p"); p.textContent = text; transfer.append(p); });
        card.append(transfer);
      }
      list.append(card);
    });
  }
  groups.forEach(button => button.addEventListener("click", () => {
    const url = data.listURL(window.location.href, button.dataset.bookingFilter);
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    render();
  }));
  window.addEventListener("popstate", render);
  window.addEventListener("pageshow", render);
  render();
})();
