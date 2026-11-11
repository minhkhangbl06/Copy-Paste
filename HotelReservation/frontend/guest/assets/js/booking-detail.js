"use strict";

(() => {
  const content = document.querySelector(".booking-detail-content");
  const data = window.BookingData;
  const reviews = window.ReviewData;
  if (!content || !data || !reviews || content.dataset.initialized) return;
  content.dataset.initialized = "true";
  const money = (value) => new Intl.NumberFormat("vi-VN").format(value) + " đ";
  let activeBooking = null,
    editSnapshot = null,
    editOpener = null,
    cancelSnapshot = null,
    cancelOpener = null,
    busy = false;
  const editPanel = document.getElementById("booking-edit-panel"),
    editForm = document.getElementById("booking-edit-form");
  const cancelDialog = document.getElementById("booking-cancel-dialog");
  const editFields = {
    checkIn: document.getElementById("edit-check-in"),
    checkOut: document.getElementById("edit-check-out"),
    guests: document.getElementById("edit-guests"),
    roomCount: document.getElementById("edit-room-count"),
  };
  const contactFields = {
    fullName: document.getElementById("edit-full-name"),
    email: document.getElementById("edit-email"),
    phone: document.getElementById("edit-phone"),
    specialRequest: document.getElementById("edit-note"),
  };
  const editUI = window.RoomSearchValidation.attach(editForm, editFields, {
    getRoomType: () => activeBooking?.stay.roomType || "",
    validateExtra: (c, r) =>
      window.RoomStay.extraErrors(
        c,
        activeBooking
          ? window.HotelRooms.find(activeBooking.stay.roomType)
          : null,
        r,
      ),
    onEdit: preview,
  });
  function feedback(message) {
    const p = document.getElementById("booking-detail-feedback");
    p.textContent = message;
    p.hidden = !message;
  }
  function preview() {
    const quote = activeBooking
      ? window.RoomStay.quote(
          editUI.read(),
          window.HotelRooms.find(activeBooking.stay.roomType),
        )
      : null;
    document.getElementById("edit-next-amount").textContent = quote
      ? money(quote.amount)
      : "Chưa đủ thông tin hợp lệ";
  }
  function fillEdit(b) {
    Object.entries(editFields).forEach(([k, f]) => {
      f.value = String(b.stay[k]);
      f.readOnly = Boolean(b.adjustment);
    });
    Object.entries(contactFields).forEach(([k, f]) => {
      f.value =
        k === "specialRequest" ? b.specialRequest : b.contact?.[k] || "";
    });
    editUI.reset();
    Object.values(contactFields).forEach((f) => {
      f.setAttribute("aria-invalid", "false");
      document.getElementById(f.id + "-error").hidden = true;
    });
    document.getElementById("booking-edit-error").hidden = true;
    document.getElementById("edit-current-amount").textContent = money(
      b.roomAmount,
    );
    document.getElementById("booking-edit-help").textContent = b.adjustment
      ? "Đang có yêu cầu điều chỉnh lưu trú chờ xác nhận. Bạn vẫn có thể cập nhật liên hệ và ghi chú."
      : b.bookingStatus === "CONFIRMED"
        ? "Thay đổi lưu trú sẽ chờ khách sạn xác nhận; thông tin hiện tại chưa thay đổi."
        : "Kiểm tra tiền phòng dự kiến trước khi lưu thay đổi.";
    preview();
  }
  function render() {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    const filter = data.normalizeFilter(params.get("filter"));
    const saved = data.load();
    const reviewState = reviews.read();
    const booking = saved.bookings.find((item) => item.reference === reference);
    if (activeBooking?.reference !== booking?.reference) {
      editPanel.hidden = true;
      editSnapshot = null;
      if (cancelDialog.open) cancelDialog.close();
    }
    activeBooking = booking || null;
    feedback(
      saved.error
        ? "Không thể đọc đầy đủ dữ liệu đã lưu. Vui lòng thử lại trước khi thao tác."
        : reviewState.error ? "Không thể đọc đầy đủ đánh giá đã lưu. Vui lòng thử lại." : "",
    );
    const missing = document.getElementById("booking-detail-missing");
    document.querySelectorAll(".booking-detail-back").forEach((link) => {
      link.href = data.listURL(window.location.href, filter).href;
    });
    content.hidden = !booking;
    missing.hidden = Boolean(booking);
    document.querySelector(".booking-detail-reference").hidden = !booking;
    if (!booking) {
      missing.querySelector("p").textContent = saved.error
        ? "Không thể đọc đầy đủ thông tin booking. Vui lòng thử lại."
        : "Không tìm thấy booking";
      return;
    }
    const selected = booking.stay;
    const room = window.HotelRooms.find(selected.roomType);
    const nights = window.RoomStay.nights(selected.checkIn, selected.checkOut);
    document.querySelector(".booking-detail-reference strong").textContent =
      booking.reference;
    document.querySelector(".booking-detail-status").textContent =
      data.labels[booking.bookingStatus] || booking.bookingStatus;
    document.querySelector(".booking-detail-room-name h3").textContent =
      room.name;
    const image = document.querySelector(".booking-detail-room-image img");
    image.src = room.image;
    image.alt = "Không gian phòng nghỉ minh họa cho loại " + room.name;
    const values = [
      selected.checkIn.split("-").reverse().join("/"),
      selected.checkOut.split("-").reverse().join("/"),
      nights + " đêm",
      selected.guests + " khách",
      selected.roomCount + " phòng",
    ];
    document
      .querySelectorAll(".booking-detail-stay-facts dd")
      .forEach((dd, index) => {
        dd.textContent = values[index];
      });
    const contact = booking.contact || {};
    document
      .querySelectorAll(".booking-detail-contact-facts dd")
      .forEach((dd, index) => {
        dd.textContent =
          [contact.fullName, contact.email, contact.phone][index] ||
          "Chưa cung cấp";
      });
    const note = document.querySelector('[aria-labelledby="requests-title"]');
    note.hidden = !booking.specialRequest.trim();
    note.querySelector("p").textContent = booking.specialRequest;
    document.querySelector(".booking-detail-price-room").textContent =
      room.name;
    document
      .querySelectorAll(".booking-detail-price-facts dd")
      .forEach((dd, index) => {
        dd.textContent = [
          money(room.price) + "/đêm",
          selected.roomCount + " phòng",
          nights + " đêm",
        ][index];
      });
    document.querySelector(".booking-detail-calculation").textContent =
      money(room.price) +
      " × " +
      selected.roomCount +
      " phòng × " +
      nights +
      " đêm";
    const currency = document.createElement("span");
    currency.textContent = "đ";
    document.querySelector(".booking-detail-total dt").textContent =
      booking.bookingStatus === "CANCELLED"
        ? "Tiền phòng trước hủy"
        : "Tiền phòng";
    document
      .querySelector(".booking-detail-total dd")
      .replaceChildren(
        new Intl.NumberFormat("vi-VN").format(booking.roomAmount) + " ",
        currency,
      );
    const transfer = document.getElementById("booking-detail-transfer");
    transfer.hidden = !booking.paymentStatus;
    if (booking.paymentStatus) {
      transfer.querySelector("h2").textContent =
        data.paymentLabels[booking.paymentStatus];
      document.querySelector("[data-demo-reported]").textContent =
        booking.reportedAmount === null
          ? "Chưa có thông tin"
          : money(booking.reportedAmount);
      document.querySelector("[data-demo-confirmed]").textContent =
        booking.confirmedAmount === null
          ? "Chưa có thông tin"
          : money(booking.confirmedAmount);
    }
    const controls = document.getElementById("booking-action-controls");
    controls.replaceChildren();
    function link(label, page) {
      const a = document.createElement("a");
      a.className = "button button-outline";
      a.textContent = label;
      a.href = data.entryURL(page, booking, window.location.href, filter).href;
      controls.append(a);
    }
    function button(label, action) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "button button-outline";
      b.textContent = label;
      b.dataset.bookingAction = action;
      controls.append(b);
    }
    if (data.canPay(booking))
      link("Tiếp tục thanh toán", "booking-payment.html");
    if (data.canViewPayment(booking))
      link("Xem thông tin thanh toán", "booking-payment.html");
    if (data.canEdit(booking))
      button(
        booking.adjustment ? "Sửa thông tin liên hệ" : "Điều chỉnh đặt phòng",
        "edit",
      );
    if (data.canCancel(booking))
      button(
        data.canPay(booking) || booking.bookingStatus === "CONFIRMED"
          ? "Hủy đặt phòng"
          : "Yêu cầu hủy",
        "cancel",
      );
    if (booking.bookingStatus === "CHECKED_IN")
      link("Sử dụng dịch vụ", "services.html");
    if (["CHECKED_IN", "CHECKED_OUT"].includes(booking.bookingStatus))
      link("Xem hóa đơn", "invoice.html");
    if (booking.bookingStatus === "CHECKED_OUT")
      link(reviewState.reviews[booking.reference] ? "Xem đánh giá" : "Đánh giá kỳ lưu trú", "review.html");
    if (["CANCELLED", "CANCEL_REQUESTED"].includes(booking.bookingStatus))
      button("Xem thông tin hủy", "cancellation-info");
    document.querySelector(".booking-detail-actions").hidden =
      !controls.children.length;
    const proposal = document.getElementById("booking-adjustment-info");
    proposal.hidden = !booking.adjustment;
    if (booking.adjustment) {
      const p = booking.adjustment;
      proposal.querySelector("p").textContent =
        "Đang chờ khách sạn xác nhận: " +
        p.stay.checkIn +
        " – " +
        p.stay.checkOut +
        ", " +
        p.stay.guests +
        " khách, " +
        p.stay.roomCount +
        " phòng. Tiền phòng dự kiến: " +
        money(p.roomAmount) +
        ". Gửi lúc " +
        new Date(p.createdAt).toLocaleString("vi-VN") +
        ".";
    }
    const cancellation = document.getElementById("booking-cancellation-info");
    cancellation.hidden = !["CANCELLED", "CANCEL_REQUESTED"].includes(
      booking.bookingStatus,
    );
    if (!cancellation.hidden) {
      const c = booking.cancellation;
      cancellation.querySelector("p").textContent = c
        ? data.labels[c.status] +
          " · " +
          new Date(c.createdAt).toLocaleString("vi-VN") +
          (c.reason ? " · Lý do: " + c.reason : "")
        : "Booking đã hủy. Chưa có thông tin chi tiết về việc hủy hoặc hoàn tiền.";
    }
    document.getElementById("booking-refund-note").hidden =
      booking.bookingStatus !== "CANCEL_REQUESTED";
  }
  document
    .getElementById("booking-action-controls")
    .addEventListener("click", (event) => {
      const button = event.target.closest("[data-booking-action]");
      if (!button || !activeBooking) return;
      const fresh = data
        .load()
        .bookings.find((b) => b.reference === activeBooking.reference);
      if (!fresh) return;
      activeBooking = fresh;
      if (button.dataset.bookingAction === "edit" && data.canEdit(fresh)) {
        editOpener = button;
        editSnapshot = JSON.parse(JSON.stringify(fresh));
        fillEdit(fresh);
        editPanel.hidden = false;
        const title = document.getElementById("booking-edit-title");
        title.focus({ preventScroll: true });
        title.scrollIntoView({ block: "start", behavior: "auto" });
      } else if (
        button.dataset.bookingAction === "cancel" &&
        data.canCancel(fresh)
      ) {
        cancelOpener = button;
        cancelSnapshot = {
          reference: fresh.reference,
          revision: fresh.revision,
        };
        document.getElementById("booking-cancel-summary").textContent =
          fresh.reference +
          " · " +
          window.HotelRooms.find(fresh.stay.roomType).name +
          " · " +
          fresh.stay.checkIn +
          " – " +
          fresh.stay.checkOut;
        document.getElementById("booking-cancel-confirm").textContent =
          data.canPay(fresh) ? "Xác nhận hủy" : "Gửi yêu cầu hủy";
        document.getElementById("booking-cancel-reason").value = "";
        document.getElementById("booking-cancel-error").hidden = true;
        cancelDialog.showModal();
        document
          .getElementById("booking-cancel-back")
          .focus({ preventScroll: true });
      } else if (button.dataset.bookingAction === "cancellation-info") {
        const title = document.querySelector("#booking-cancellation-info h2");
        title.focus({ preventScroll: true });
        title.scrollIntoView({ block: "start", behavior: "auto" });
      }
    });
  document
    .getElementById("booking-edit-cancel")
    .addEventListener("click", () => {
      if (editSnapshot) fillEdit(editSnapshot);
      editPanel.hidden = true;
      editOpener?.focus({ preventScroll: true });
    });
  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!editSnapshot || busy) return;
    const values = {
      ...editUI.read(),
      contact: {
        fullName: contactFields.fullName.value,
        email: contactFields.email.value,
        phone: contactFields.phone.value,
      },
      specialRequest: contactFields.specialRequest.value,
    };
    const result = data.update(
      editSnapshot.reference,
      editSnapshot.revision,
      values,
    );
    const errors = result.errors || {};
    editUI.showErrors(errors, true);
    Object.entries(contactFields).forEach(([key, f]) => {
      const p = document.getElementById(f.id + "-error");
      p.textContent = errors[key] || "";
      p.hidden = !errors[key];
      f.setAttribute("aria-invalid", String(Boolean(errors[key])));
    });
    if (Object.keys(errors).length) {
      const first = Object.keys(editFields).find((k) => errors[k]);
      if (first) editUI.focusFirst(errors);
      else
        contactFields[
          Object.keys(contactFields).find((k) => errors[k])
        ]?.focus();
      return;
    }
    if (result.error) {
      const p = document.getElementById("booking-edit-error");
      p.textContent = result.error;
      p.hidden = false;
      return;
    }
    editPanel.hidden = true;
    render();
    feedback("");
  });
  document
    .getElementById("booking-cancel-back")
    .addEventListener("click", () => cancelDialog.close());
  cancelDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelDialog.close();
  });
  cancelDialog.addEventListener("close", () => {
    cancelSnapshot = null;
    if (cancelOpener?.isConnected) cancelOpener.focus({ preventScroll: true });
    else
      document
        .querySelector(".booking-detail-back")
        .focus({ preventScroll: true });
  });
  document
    .getElementById("booking-cancel-confirm")
    .addEventListener("click", () => {
      if (busy || !cancelSnapshot) return;
      busy = true;
      const result = data.cancel(
        cancelSnapshot.reference,
        cancelSnapshot.revision,
        document.getElementById("booking-cancel-reason").value,
      );
      busy = false;
      if (result.error) {
        const p = document.getElementById("booking-cancel-error");
        p.textContent = result.error;
        p.hidden = false;
        return;
      }
      render();
      cancelDialog.close();
      feedback(data.labels[activeBooking.bookingStatus]);
    });
  window.addEventListener("pageshow", render);
  window.addEventListener("popstate", render);
  render();
})();
