"use strict";

(() => {
  const page = document.querySelector(".deposit-page");
  const drafts = window.BookingDraft;
  const data = window.HotelRooms;
  const stay = window.RoomStay;
  const simulation = window.BookingSimulation;
  const bookingData = window.BookingData;
  if (!page || !drafts || !data || !stay || !simulation || !bookingData || page.dataset.paymentInitialized) return;
  page.dataset.paymentInitialized = "true";
  const content = document.querySelector(".deposit-content");
  const invalid = document.getElementById("payment-invalid");
  const back = document.querySelector(".deposit-back");
  const money = value => new Intl.NumberFormat("vi-VN").format(value) + " đ";
  const pageParams = new URLSearchParams(window.location.search);
  const selectedReference = pageParams.has("reference") ? pageParams.get("reference") : null;
  const listFilter = window.BookingData.normalizeFilter(pageParams.get("filter"));
  const prepare = () => simulation.prepare(selectedReference);
  const quoteFor = current => current.record ? {
    amount: simulation.amountOf(current.draft), rooms: current.draft.stay.roomCount,
    nights: stay.nights(current.draft.stay.checkIn, current.draft.stay.checkOut),
  } : stay.quote(drafts.criteriaOf(current.draft), data.find(current.draft.stay.roomType));
  const dialog = document.getElementById("payment-report-dialog");
  const confirm = page.querySelector(".deposit-confirm");
  const reported = document.getElementById("payment-reported");
  let pending = null;
  let sending = false;
  function showError(message) {
    const error = document.getElementById("payment-error");
    error.textContent = message;
    error.hidden = !message;
  }
  function fill(selector, value) {
    page.querySelectorAll(selector).forEach(element => { element.textContent = value; });
  }
  function render() {
    const saved = prepare();
    content.hidden = !saved.draft;
    invalid.hidden = Boolean(saved.draft);
    page.querySelector(".deposit-status").hidden = !saved.draft;
    if (!saved.draft) {
      back.href = new URL("rooms.html", window.location.href).href;
      back.textContent = "← Về danh sách phòng";
      return;
    }
    const draft = saved.draft;
    const record = saved.record;
    showError(saved.error ? "Không thể lưu hoặc đọc đầy đủ thông tin. Vui lòng thử lại." : "");
    const reference = saved.error ? "—" : draft.payment?.reference || "—";
    fill("[data-payment-reference-id]", reference);
    fill(".deposit-status", record ? "Chờ xác nhận chuyển khoản" : "Chờ thanh toán");
    Object.entries(draft.contact).forEach(([key, value]) => fill('[data-payment-contact="' + key + '"]', value));
    document.getElementById("payment-note-block").hidden = !draft.specialRequest.trim();
    fill("[data-payment-note]", draft.specialRequest);
    const criteria = drafts.criteriaOf(draft);
    const room = data.find(criteria.roomType);
    const quote = quoteFor(saved);
    back.href = selectedReference === null ? drafts.bookingURL(draft, window.location.href).href : window.BookingData.listURL(window.location.href, listFilter).href;
    back.textContent = selectedReference === null ? "← Về thông tin đặt phòng" : "← Về booking của tôi";
    fill("[data-payment-room]", room.name);
    const image = page.querySelector(".deposit-room-image img");
    image.src = room.image;
    image.alt = "Không gian phòng nghỉ minh họa cho loại " + room.name;
    for (const key of ["checkIn", "checkOut"]) {
      const time = page.querySelector('[data-payment-stay="' + key + '"]');
      time.dateTime = criteria[key];
      time.textContent = criteria[key].split("-").reverse().join("/");
    }
    fill('[data-payment-stay="nights"]', quote.nights + " đêm");
    fill('[data-payment-stay="guests"]', draft.stay.guests + " khách");
    fill('[data-payment-stay="roomCount"]', quote.rooms + " phòng");
    fill("[data-payment-unit-price]", money(room.price) + "/đêm");
    fill("[data-payment-total]", money(quote.amount));
    fill(".deposit-calculation", money(room.price) + " × " + quote.rooms + " phòng × " + quote.nights + " đêm = " + money(quote.amount));
    for (const plan of ["deposit", "full"]) {
      const amounts = drafts.paymentAmounts(quote.amount, plan);
      fill('[data-plan-amount="' + plan + '"]', money(amounts.amount));
      fill('[data-plan-remaining="' + plan + '"]', money(amounts.remaining));
    }
    const plan = record?.plan || draft.payment?.plan || "deposit";
    page.querySelectorAll('input[name="paymentPlan"]').forEach(input => { input.checked = input.value === plan; });
    page.querySelector(".payment-options").disabled = Boolean(record || saved.error);
    const amounts = drafts.paymentAmounts(quote.amount, plan);
    fill("[data-payment-label]", plan === "full" ? "Thanh toán toàn bộ" : "Đặt cọc 30%");
    fill("[data-payment-amount]", money(amounts.amount));
    fill("[data-payment-remaining]", money(amounts.remaining));
    fill("[data-payment-reference]", reference === "—" ? "—" : reference + (plan === "full" ? " TIEN PHONG" : " COC"));
    fill("[data-payment-explanation]", plan === "full"
      ? "Bạn đã chọn trả trước toàn bộ tiền phòng. Dịch vụ và khoản phát sinh được thanh toán khi check-out."
      : "Tiền phòng còn lại và dịch vụ phát sinh được thanh toán khi check-out.");
    reported.hidden = !record;
    confirm.hidden = Boolean(record);
    // Keep retry possible after a transient storage error; click revalidates first.
    confirm.disabled = false;
    if (record) {
      fill("[data-payment-reported]", money(record.reportedAmount));
      document.getElementById("payment-my-bookings").href = window.BookingData.listURL(window.location.href, listFilter).href;
      const detail = new URL("booking-detail.html", window.location.href);
      detail.search = new URLSearchParams({ reference: record.reference }).toString();
      if (listFilter !== "all") detail.searchParams.set("filter", listFilter);
      document.getElementById("payment-booking-detail").href = detail.href;
    }
    // Backend must issue real IDs and reconcile actual money. QR artwork stays inert.
  }
  page.addEventListener("change", event => {
    if (!event.target.matches('input[name="paymentPlan"]') || !event.target.checked) return;
    const saved = simulation.choose(event.target.value, selectedReference);
    render();
    if (!saved) showError("Không thể lưu lựa chọn thanh toán. Vui lòng thử lại.");
  });
  confirm.addEventListener("click", () => {
    const current = prepare();
    if (current.error || !current.draft) { render(); return; }
    if (current.record || dialog.open) return;
    const draft = current.draft;
    pending = { reference: draft.payment.reference, plan: draft.payment.plan, fingerprint: simulation.fingerprint(draft) };
    const quote = quoteFor(current);
    const amount = drafts.paymentAmounts(quote.amount, pending.plan).amount;
    document.getElementById("payment-report-summary").textContent = (pending.plan === "full" ? "Thanh toán toàn bộ: " : "Đặt cọc 30%: ") + money(amount);
    document.getElementById("payment-dialog-error").hidden = true;
    dialog.showModal();
    document.getElementById("payment-report-back").focus({ preventScroll: true });
  });
  document.getElementById("payment-report-back").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => { event.preventDefault(); dialog.close(); });
  dialog.addEventListener("close", () => {
    pending = null;
    if (!confirm.hidden) confirm.focus({ preventScroll: true });
    else reported.focus({ preventScroll: true });
  });
  document.getElementById("payment-report-send").addEventListener("click", () => {
    if (sending || !pending) return;
    sending = true;
    const result = simulation.send(pending, selectedReference);
    sending = false;
    if (result.error) {
      const error = document.getElementById("payment-dialog-error");
      error.textContent = "Không thể lưu thông báo. Vui lòng kiểm tra thông tin và thử lại.";
      error.hidden = false;
      return;
    }
    render();
    dialog.close();
  });
  window.addEventListener("pageshow", render);
  render();
})();
