/* Booking Management - Front Desk
 * Demo data only. Connect API after the Backend team confirms endpoint/response contract.
 */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector) => document.querySelector(selector);
  const tableBody = $("#bookings-table-body");
  const searchInput = $("#booking-search");
  const statusFilter = $("#status-filter");
  const dateFilter = $("#date-filter");
  const createDialog = $("#booking-dialog");
  const detailDialog = $("#detail-dialog");
  const bookingForm = $("#booking-form");
  const formFeedback = $("#form-feedback");
  const toast = $("#toast");

  const statusLabels = {
    pending: "Chờ xác nhận",
    confirmed: "Đã xác nhận",
    checked_in: "Đang lưu trú",
    checked_out: "Đã trả phòng",
    cancelled: "Đã hủy"
  };
  const statusClasses = {
    pending: "status-pending",
    confirmed: "status-confirmed",
    checked_in: "status-checked",
    checked_out: "status-checked-out",
    cancelled: "status-cancelled"
  };

  // Các bản ghi dưới đây chỉ phục vụ kiểm tra UI, không phải dữ liệu khách sạn thật.
  let bookings = [
    { id: 1024, code: "BK-1024", guest_name: "Nguyễn Minh Anh", guest_phone: "0901 234 567", room: "Deluxe 305", check_in_date: "2026-11-05", check_out_date: "2026-11-08", status: "confirmed", total: 3600000, deposit: 1080000 },
    { id: 1023, code: "BK-1023", guest_name: "Trần Hoàng Nam", guest_phone: "0902 345 678", room: "Suite 402", check_in_date: "2026-11-05", check_out_date: "2026-11-07", status: "pending", total: 4200000, deposit: 1260000 },
    { id: 1022, code: "BK-1022", guest_name: "Lê Thu Hà", guest_phone: "0903 456 789", room: "Standard 201", check_in_date: "2026-11-06", check_out_date: "2026-11-09", status: "checked_in", total: 2700000, deposit: 900000 },
    { id: 1021, code: "BK-1021", guest_name: "Phạm Quốc Bảo", guest_phone: "0904 567 890", room: "Deluxe 308", check_in_date: "2026-11-04", check_out_date: "2026-11-06", status: "cancelled", total: 2400000, deposit: 720000 },
    { id: 1020, code: "BK-1020", guest_name: "Võ Ngọc Mai", guest_phone: "0905 678 901", room: "Standard 202", check_in_date: "2026-11-01", check_out_date: "2026-11-03", status: "checked_out", total: 1800000, deposit: 540000 },
    { id: 1019, code: "BK-1019", guest_name: "Đặng Gia Huy", guest_phone: "0906 789 012", room: "Deluxe 306", check_in_date: "2026-11-07", check_out_date: "2026-11-10", status: "confirmed", total: 3600000, deposit: 1080000 }
  ];

  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const formatDate = (value) => value ? new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`)) : "—";
  const formatMoney = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value || 0);
  const showToast = (message) => {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2600);
  };

  function updateSummary() {
    $("#summary-total").textContent = bookings.length;
    $("#summary-confirmed").textContent = bookings.filter((item) => item.status === "confirmed").length;
    $("#summary-checked-in").textContent = bookings.filter((item) => item.status === "checked_in").length;
    $("#summary-cancelled").textContent = bookings.filter((item) => item.status === "cancelled").length;
  }

  function renderBookings() {
    const keyword = searchInput.value.trim().toLocaleLowerCase("vi");
    const selectedStatus = statusFilter.value;
    const selectedDate = dateFilter.value;
    const filtered = bookings.filter((item) => {
      const searchable = `${item.code} ${item.guest_name} ${item.guest_phone} ${item.room}`.toLocaleLowerCase("vi");
      return (!keyword || searchable.includes(keyword)) &&
        (selectedStatus === "all" || item.status === selectedStatus) &&
        (!selectedDate || item.check_in_date >= selectedDate);
    });

    tableBody.innerHTML = filtered.map((item) => {
      const canCancel = !["checked_out", "cancelled"].includes(item.status);
      return `<tr>
        <td class="booking-code">#${escapeHTML(item.code)}</td>
        <td><span class="guest-name">${escapeHTML(item.guest_name)}</span></td>
        <td><span class="guest-contact">${escapeHTML(item.guest_phone || "Chưa cập nhật")}</span></td>
        <td>${escapeHTML(item.room || "—")}</td>
        <td>${formatDate(item.check_in_date)}</td>
        <td>${formatDate(item.check_out_date)}</td>
        <td><span class="status ${statusClasses[item.status] || ""}">${statusLabels[item.status] || "Không xác định"}</span></td>
        <td><div class="row-actions"><button class="table-action" type="button" data-action="detail" data-id="${item.id}">Chi tiết</button>${canCancel ? `<button class="table-action danger" type="button" data-action="cancel" data-id="${item.id}">Hủy</button>` : ""}</div></td>
      </tr>`;
    }).join("");
    $("#bookings-empty").hidden = filtered.length > 0;
    $("#results-count").textContent = `Hiển thị ${filtered.length}/${bookings.length} đặt phòng`;
    updateSummary();
  }

  function showDetails(id) {
    const item = bookings.find((booking) => booking.id === id);
    if (!item) return;
    $("#booking-detail-content").innerHTML = `<div class="detail-list">
      <div class="detail-item"><span>Mã đặt phòng</span><strong>#${escapeHTML(item.code)}</strong></div>
      <div class="detail-item"><span>Trạng thái</span><strong>${statusLabels[item.status]}</strong></div>
      <div class="detail-item"><span>Khách hàng</span><strong>${escapeHTML(item.guest_name)}</strong></div>
      <div class="detail-item"><span>Số điện thoại</span><strong>${escapeHTML(item.guest_phone || "Chưa cập nhật")}</strong></div>
      <div class="detail-item"><span>Phòng</span><strong>${escapeHTML(item.room || "—")}</strong></div>
      <div class="detail-item"><span>Số đêm</span><strong>${Math.max(0, (new Date(item.check_out_date) - new Date(item.check_in_date)) / 86400000)} đêm</strong></div>
      <div class="detail-item"><span>Ngày nhận phòng</span><strong>${formatDate(item.check_in_date)}</strong></div>
      <div class="detail-item"><span>Ngày trả phòng</span><strong>${formatDate(item.check_out_date)}</strong></div>
      <div class="detail-item"><span>Tổng tiền phòng</span><strong>${formatMoney(item.total)}</strong></div>
      <div class="detail-item"><span>Tiền đặt cọc</span><strong>${formatMoney(item.deposit)}</strong></div>
    </div>`;
    detailDialog.showModal();
  }

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === "detail") showDetails(id);
    if (button.dataset.action === "cancel") {
      const item = bookings.find((booking) => booking.id === id);
      if (!item || ["checked_out", "cancelled"].includes(item.status)) return;
      if (window.confirm(`Bạn có chắc muốn hủy booking ${item.code} của khách ${item.guest_name}?\n\nBản demo không tính/ghi nhận tiền hoàn. Backend sẽ cần trả về mức hoàn cọc thực tế.`)) {
        item.status = "cancelled";
        renderBookings();
        showToast(`Đã cập nhật trạng thái demo của ${item.code} thành Đã hủy.`);
      }
    }
  });

  [searchInput, statusFilter, dateFilter].forEach((control) => control.addEventListener("input", renderBookings));
  $("#reset-filters").addEventListener("click", () => {
    searchInput.value = ""; statusFilter.value = "all"; dateFilter.value = ""; renderBookings();
  });

  const openCreateDialog = () => {
    bookingForm.reset(); formFeedback.hidden = true; createDialog.showModal();
  };
  $("#open-create-modal").addEventListener("click", openCreateDialog);
  $("#close-dialog").addEventListener("click", () => createDialog.close());
  $("#cancel-dialog").addEventListener("click", () => createDialog.close());
  $("#close-detail").addEventListener("click", () => detailDialog.close());
  $("#close-detail-footer").addEventListener("click", () => detailDialog.close());

  bookingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(bookingForm);
    const guestName = String(data.get("guest_name") || "").trim();
    const phone = String(data.get("guest_phone") || "").trim();
    const room = String(data.get("room_ids") || "").trim();
    const checkIn = String(data.get("check_in_date") || "");
    const checkOut = String(data.get("check_out_date") || "");
    if (!guestName || !room || !checkIn || !checkOut) {
      formFeedback.textContent = "Vui lòng nhập đầy đủ các trường bắt buộc."; formFeedback.hidden = false; return;
    }
    if (checkOut <= checkIn) {
      formFeedback.textContent = "Ngày trả phòng phải sau ngày nhận phòng."; formFeedback.hidden = false; return;
    }
    const id = Math.max(...bookings.map((item) => item.id), 1024) + 1;
    const roomLabel = room.split(",").map((value) => value.trim()).filter(Boolean).join(", ");
    bookings.unshift({ id, code: `BK-${id}`, guest_name: guestName, guest_phone: phone, room: roomLabel, check_in_date: checkIn, check_out_date: checkOut, status: "confirmed", total: 0, deposit: 0 });
    createDialog.close();
    searchInput.value = ""; statusFilter.value = "all"; dateFilter.value = "";
    renderBookings();
    showToast(`Đã tạo ${`BK-${id}`} trong dữ liệu demo. Trạng thái: Đã xác nhận.`);
  });

  const todayLabel = $("#today-label");
  if (todayLabel) todayLabel.textContent = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  const sidebar = $("#sidebar");
  const menuToggle = $("#menu-toggle");
  const backdrop = $("#sidebar-backdrop");
  const setSidebarOpen = (open) => {
    sidebar.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    document.body.classList.toggle("menu-open", open);
  };
  menuToggle?.addEventListener("click", () => setSidebarOpen(menuToggle.getAttribute("aria-expanded") !== "true"));
  backdrop?.addEventListener("click", () => setSidebarOpen(false));

  renderBookings();
});
