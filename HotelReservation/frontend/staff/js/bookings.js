/**
 * Booking Management - Staff Front Desk Portal
 * File: HotelReservation/frontend/staff/js/bookings.js
 * Author: Pham Quang Duy (Staff Frontend)
 *
 * Quy tắc bắt buộc:
 * 1. Sử dụng StaffAPI từ js/api.js.
 * 2. API thật là nguồn dữ liệu chính mặc định. Mock Mode chỉ được bật khi người dùng chủ động.
 * 3. Tuyệt đối không tự động chuyển sang Mock Data khi API lỗi.
 * 4. Xử lý đúng chính sách hủy phòng BR-06 (UT-CAN-01: 100%, UT-CAN-02: 50%, UT-CAN-03: 0%).
 * 5. Xử lý đầy đủ Loading, Empty, Error state và Validation dữ liệu.
 */

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  // Hàm chọn phần tử DOM tiện ích
  function $(selector) {
    return document.querySelector(selector);
  }

  // ==========================================
  // 1. CÁC PHẦN TỬ DOM GIAO DIỆN CHÍNH
  // ==========================================
  var tableBody = $("#bookings-table-body");
  var loadingState = $("#bookings-loading");
  var errorState = $("#bookings-error");
  var emptyState = $("#bookings-empty");
  var tableScroll = $("#table-scroll-container");
  var searchInput = $("#booking-search");
  var statusFilter = $("#status-filter");
  var dateFilter = $("#date-filter");
  var resultsCount = $("#results-count");
  var connectionNote = $("#connection-status-note");
  var dataSourceDesc = $("#data-source-description");
  var toastElement = $("#toast");

  // Điều khiển chế độ API thật / Mock Mode
  var modeBadge = $("#mode-badge");
  var modeToggleBtn = $("#mode-toggle-btn");
  var modeNoticeBanner = $("#mode-notice-banner");
  var switchToApiBtn = $("#switch-to-api-btn");
  var enableMockBtn = $("#enable-mock-btn");
  var retryFetchBtn = $("#retry-fetch-btn");

  // Modal Tạo booking mới
  var createDialog = $("#booking-dialog");
  var bookingForm = $("#booking-form");
  var roomSelect = $("#booking-room-select");
  var formFeedback = $("#form-feedback");
  var formFootnote = $("#form-mode-footnote");
  var checkInInput = $("#booking-checkin-date");
  var checkOutInput = $("#booking-checkout-date");
  var costPreviewBox = $("#cost-preview-box");
  var submitBookingBtn = $("#submit-booking-btn");

  // Modal Xem chi tiết booking
  var detailDialog = $("#detail-dialog");
  var detailContent = $("#booking-detail-content");

  // Modal Hủy booking theo BR-06
  var cancelDialog = $("#cancel-dialog");
  var cancelCalcContent = $("#cancel-calc-content");
  var cancelConfirmBtn = $("#cancel-confirm-btn");
  var cancelAbortBtn = $("#cancel-abort-btn");
  var closeCancelBtn = $("#close-cancel-dialog");

  // ==========================================
  // 2. STATE DỮ LIỆU CỤC BỘ
  // ==========================================
  var allBookings = [];
  var availableRooms = [];
  var activeCancellingBooking = null;
  var activeRefundCalculation = null;
  var toastTimer = null;

  // Bản đồ nhãn và CSS trạng thái
  var STATUS_LABELS = {
    pending: "Chờ xác nhận",
    confirmed: "Đã xác nhận",
    checked_in: "Đang lưu trú",
    checked_out: "Đã trả phòng",
    cancelled: "Đã hủy"
  };

  var STATUS_CLASSES = {
    pending: "status-pending",
    confirmed: "status-confirmed",
    checked_in: "status-checked",
    checked_out: "status-checked-out",
    cancelled: "status-cancelled"
  };

  // ==========================================
  // 3. CÁC HÀM TIỆN ÍCH DÙNG CHUNG
  // ==========================================
  function escapeHTML(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("'").join("&#39;");
  }

  function formatDate(value) {
    if (!value) return "—";
    try {
      var parts = String(value).split("T")[0].split("-");
      if (parts.length === 3) {
        return parts[2] + "/" + parts[1] + "/" + parts[0];
      }
      return new Intl.DateTimeFormat("vi-VN").format(new Date(value));
    } catch (e) {
      return String(value);
    }
  }

  function formatMoney(value) {
    var num = Number(value) || 0;
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0
    }).format(num);
  }

  function showToast(message, isError) {
    if (!toastElement) return;
    toastElement.textContent = message;
    toastElement.style.background = isError ? "#8c2824" : "var(--color-ink)";
    toastElement.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastElement.hidden = true;
    }, 3200);
  }

  // ==========================================
  // 4. ĐỒNG BỘ GIAO DIỆN THEO CHẾ ĐỘ (API / MOCK)
  // ==========================================
  function syncModeUI() {
    if (typeof StaffAPI === "undefined") {
      showToast("Lỗi: Không tìm thấy module StaffAPI từ api.js.", true);
      return;
    }

    var info = StaffAPI.getModeInfo();

    if (modeBadge) {
      modeBadge.textContent = info.badgeText;
      modeBadge.className = "mode-badge " + info.badgeClass;
    }
    if (modeNoticeBanner) {
      modeNoticeBanner.hidden = !info.isMock;
    }
    if (dataSourceDesc) {
      dataSourceDesc.textContent = info.description;
    }
    if (connectionNote) {
      connectionNote.textContent = info.isMock
        ? "Nguồn: LocalStorage (Mock Mode)"
        : "Nguồn: Backend API (127.0.0.1:8000)";
    }
    if (formFootnote) {
      formFootnote.textContent = info.isMock
        ? "Đang ở chế độ Mock: Dữ liệu đặt phòng mới sẽ lưu vào LocalStorage."
        : "Đang ở chế độ API Thật: Đơn sẽ gửi trực tiếp đến Backend Laravel.";
    }
  }

  // ==========================================
  // 5. TẢI DANH SÁCH ĐẶT PHÒNG
  // ==========================================
  async function fetchBookings() {
    syncModeUI();

    if (loadingState) loadingState.hidden = false;
    if (errorState) errorState.hidden = true;
    if (emptyState) emptyState.hidden = true;
    if (tableScroll) tableScroll.hidden = true;

    try {
      var searchVal = searchInput ? searchInput.value.trim() : "";
      var statusVal = statusFilter ? statusFilter.value : "all";
      var dateVal = dateFilter ? dateFilter.value : "";

      var response = await StaffAPI.getBookings({
        search: searchVal,
        status: statusVal,
        check_in_date: dateVal
      });

      allBookings = Array.isArray(response.data) ? response.data : [];

      if (loadingState) loadingState.hidden = true;
      if (tableScroll) tableScroll.hidden = false;

      renderBookings();
      updateSummary();
    } catch (error) {
      if (loadingState) loadingState.hidden = true;
      if (tableScroll) tableScroll.hidden = true;
      if (errorState) errorState.hidden = false;

      var isMockActive = StaffAPI.isMockMode();
      var errTitleEl = $("#error-title");
      var errMsgEl = $("#error-message");

      if (errTitleEl) {
        errTitleEl.textContent = isMockActive
          ? "Lỗi đọc dữ liệu mô phỏng"
          : "Không thể kết nối đến Backend API";
      }

      if (errMsgEl) {
        if (isMockActive) {
          errMsgEl.textContent = error.message;
        } else {
          errMsgEl.innerHTML = "<strong>Địa chỉ:</strong> <code>http://127.0.0.1:8000/api/bookings</code><br>" +
            "<strong>Chi tiết lỗi:</strong> " + escapeHTML(error.message) + "<br>" +
            "<span style=\"color:#666;font-size:10px;\">Lưu ý: Nếu Backend chưa chạy hoặc chưa có route GET /api/bookings, bạn có thể chủ động bấm nút dưới để bật Mock Mode kiểm thử giao diện.</span>";
        }
      }

      if (resultsCount) {
        resultsCount.textContent = "Không có dữ liệu (Lỗi kết nối)";
      }
    }
  }

  // ==========================================
  // 6. HIỂN THỊ BẢNG VÀ THỐNG KÊ
  // ==========================================
  function renderBookings() {
    var searchKw = searchInput ? searchInput.value.trim().toLowerCase() : "";
    var selectedStatus = statusFilter ? statusFilter.value : "all";
    var selectedDate = dateFilter ? dateFilter.value : "";

    var filtered = allBookings.filter(function (bItem) {
      var roomNum = bItem.room && bItem.room.room_number ? String(bItem.room.room_number) : "";
      var searchable = (String(bItem.booking_code || "") + " " +
        String(bItem.guest_name || "") + " " +
        String(bItem.guest_phone || "") + " " +
        roomNum).toLowerCase();

      var matchKw = !searchKw || searchable.indexOf(searchKw) !== -1;
      var matchStatus = (selectedStatus === "all") || (bItem.status === selectedStatus);
      var matchDate = !selectedDate || (bItem.check_in_date >= selectedDate);

      return matchKw && matchStatus && matchDate;
    });

    if (!tableBody) return;

    if (filtered.length === 0) {
      tableBody.innerHTML = "";
      if (emptyState) emptyState.hidden = false;
    } else {
      if (emptyState) emptyState.hidden = true;

      var rowsHtml = filtered.map(function (bItem) {
        var canCancel = (bItem.status !== "checked_out" && bItem.status !== "cancelled");
        var roomDisplay = "—";
        if (bItem.room && bItem.room.room_number) {
          roomDisplay = bItem.room.room_number + " (" + bItem.room.room_type + ")";
        } else if (bItem.room_id) {
          roomDisplay = "Phòng #" + bItem.room_id;
        }

        var cancelBtnHtml = "";
        if (canCancel) {
          cancelBtnHtml = '<button class="table-action danger" type="button" data-action="cancel" data-id="' +
            escapeHTML(bItem.id) + '" title="Hủy đơn theo chính sách BR-06">Hủy đơn</button>';
        }

        var rowBadgeClass = STATUS_CLASSES[bItem.status] || "";
        var rowBadgeText = STATUS_LABELS[bItem.status] || bItem.status;

        return "<tr>" +
          '<td class="booking-code">#' + escapeHTML(bItem.booking_code || bItem.id) + "</td>" +
          '<td><span class="guest-name">' + escapeHTML(bItem.guest_name) + "</span></td>" +
          '<td><span class="guest-contact">' + escapeHTML(bItem.guest_phone || "Chưa cập nhật") + "</span></td>" +
          "<td>" + escapeHTML(roomDisplay) + "</td>" +
          "<td>" + formatDate(bItem.check_in_date) + "</td>" +
          "<td>" + formatDate(bItem.check_out_date) + "</td>" +
          '<td><span class="status ' + rowBadgeClass + '">' + escapeHTML(rowBadgeText) + "</span></td>" +
          "<td>" +
            '<div class="row-actions">' +
              '<button class="table-action" type="button" data-action="detail" data-id="' + escapeHTML(bItem.id) + '">Chi tiết</button>' +
              cancelBtnHtml +
            "</div>" +
          "</td>" +
        "</tr>";
      }).join("");

      tableBody.innerHTML = rowsHtml;
    }

    if (resultsCount) {
      resultsCount.textContent = "Hiển thị " + filtered.length + "/" + allBookings.length + " đơn đặt phòng";
    }
  }

  function updateSummary() {
    var totalEl = $("#summary-total");
    var confirmedEl = $("#summary-confirmed");
    var checkedInEl = $("#summary-checked-in");
    var cancelledEl = $("#summary-cancelled");

    if (totalEl) totalEl.textContent = allBookings.length;
    if (confirmedEl) {
      confirmedEl.textContent = allBookings.filter(function (b) { return b.status === "confirmed"; }).length;
    }
    if (checkedInEl) {
      checkedInEl.textContent = allBookings.filter(function (b) { return b.status === "checked_in"; }).length;
    }
    if (cancelledEl) {
      cancelledEl.textContent = allBookings.filter(function (b) { return b.status === "cancelled"; }).length;
    }
  }

  // ==========================================
  // 7. XEM CHI TIẾT ĐẶT PHÒNG
  // ==========================================
  function showDetails(targetId) {
    var detailTargetBooking = allBookings.find(function (b) {
      return String(b.id) === String(targetId);
    });
    if (!detailTargetBooking) return;

    var nights = 0;
    try {
      var dIn = new Date(detailTargetBooking.check_in_date);
      var dOut = new Date(detailTargetBooking.check_out_date);
      nights = Math.max(0, Math.round((dOut - dIn) / 86400000));
    } catch (e) {
      nights = 0;
    }

    var roomInfo = "Chưa gán";
    if (detailTargetBooking.room && detailTargetBooking.room.room_number) {
      roomInfo = "Phòng " + detailTargetBooking.room.room_number + " · Loại " + detailTargetBooking.room.room_type +
        " (" + formatMoney(detailTargetBooking.room.price_per_night) + "/đêm)";
    } else if (detailTargetBooking.room_id) {
      roomInfo = "Phòng #" + detailTargetBooking.room_id;
    }

    var refundHtml = "";
    if (detailTargetBooking.refund_amount !== undefined && detailTargetBooking.refund_amount !== null) {
      refundHtml = '<div class="detail-item" style="grid-column: 1 / -1; background:#fdf5f4; padding:8px 10px; border:1px solid #f1c1be;">' +
        "<span>TIỀN HOÀN CỌC ĐÃ TÍNH (BR-06)</span>" +
        '<strong style="color:#8c2824;">' + formatMoney(detailTargetBooking.refund_amount) +
        " (Tỷ lệ: " + escapeHTML(detailTargetBooking.refund_rate || "—") + ")</strong>" +
      "</div>";
    }

    var detailBadgeClass = STATUS_CLASSES[detailTargetBooking.status] || "";
    var detailBadgeText = STATUS_LABELS[detailTargetBooking.status] || detailTargetBooking.status;

    detailContent.innerHTML = '<div class="detail-list">' +
      '<div class="detail-item">' +
        "<span>MÃ ĐẶT PHÒNG</span>" +
        "<strong>#" + escapeHTML(detailTargetBooking.booking_code || detailTargetBooking.id) + "</strong>" +
      "</div>" +
      '<div class="detail-item">' +
        "<span>TRẠNG THÁI</span>" +
        '<strong><span class="status ' + detailBadgeClass + '">' + escapeHTML(detailBadgeText) + "</span></strong>" +
      "</div>" +
      '<div class="detail-item">' +
        "<span>KHÁCH HÀNG</span>" +
        "<strong>" + escapeHTML(detailTargetBooking.guest_name) + "</strong>" +
      "</div>" +
      '<div class="detail-item">' +
        "<span>SỐ ĐIỆN THOẠI</span>" +
        "<strong>" + escapeHTML(detailTargetBooking.guest_phone || "Chưa cập nhật") + "</strong>" +
      "</div>" +
      '<div class="detail-item full-width" style="grid-column: 1 / -1;">' +
        "<span>THÔNG TIN PHÒNG</span>" +
        "<strong>" + escapeHTML(roomInfo) + "</strong>" +
      "</div>" +
      '<div class="detail-item">' +
        "<span>NGÀY NHẬN PHÒNG</span>" +
        "<strong>" + formatDate(detailTargetBooking.check_in_date) + " (Check-in 14:00)</strong>" +
      "</div>" +
      '<div class="detail-item">' +
        "<span>NGÀY TRẢ PHÒNG</span>" +
        "<strong>" + formatDate(detailTargetBooking.check_out_date) + " (Check-out 12:00)</strong>" +
      "</div>" +
      '<div class="detail-item">' +
        "<span>SỐ ĐÊM LƯU TRÚ</span>" +
        "<strong>" + nights + " đêm</strong>" +
      "</div>" +
      '<div class="detail-item">' +
        "<span>TỔNG TIỀN PHÒNG</span>" +
        "<strong>" + formatMoney(detailTargetBooking.total_room_amount) + "</strong>" +
      "</div>" +
      '<div class="detail-item">' +
        "<span>TIỀN ĐẶT CỌC (BR-04/05)</span>" +
        "<strong>" + formatMoney(detailTargetBooking.deposit_amount) + "</strong>" +
      "</div>" +
      refundHtml +
    "</div>";

    detailDialog.showModal();
  }

  // ==========================================
  // 8. HỦY ĐẶT PHÒNG THEO BR-06 (CANCELLATION POLICY)
  // ==========================================
  function openCancelModal(cancelTargetId) {
    var cancelTargetBooking = allBookings.find(function (b) {
      return String(b.id) === String(cancelTargetId);
    });
    if (!cancelTargetBooking) return;

    if (cancelTargetBooking.status === "checked_out" || cancelTargetBooking.status === "cancelled") {
      showToast("Đơn đặt phòng đang ở trạng thái không thể hủy.", true);
      return;
    }

    activeCancellingBooking = cancelTargetBooking;
    activeRefundCalculation = StaffAPI.calculateBR06Refund(cancelTargetBooking);

    var calc = activeRefundCalculation;
    var roomText = "Phòng chưa gán";
    if (cancelTargetBooking.room && cancelTargetBooking.room.room_number) {
      roomText = "Phòng " + cancelTargetBooking.room.room_number;
    } else if (cancelTargetBooking.room_id) {
      roomText = "Phòng #" + cancelTargetBooking.room_id;
    }

    var nowFormatted = new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date());

    var hoursColor = calc.hoursRemaining >= 24 ? "#1b6326" : "#8c2824";

    cancelCalcContent.innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">' +
        "<span>Mã booking: <strong>#" + escapeHTML(cancelTargetBooking.booking_code || cancelTargetBooking.id) + "</strong></span>" +
        "<span>Khách: <strong>" + escapeHTML(cancelTargetBooking.guest_name) + "</strong></span>" +
        "<span>" + escapeHTML(roomText) + "</span>" +
      "</div>" +
      '<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;">' +
        "<div>Thời điểm nhận phòng: <strong>" + formatDate(cancelTargetBooking.check_in_date) + " lúc 14:00</strong></div>" +
        "<div>Thời điểm hiện tại: <strong>" + nowFormatted + "</strong></div>" +
        "<div>Thời gian còn lại: <strong style=\"color:" + hoursColor + ';">' + calc.hoursRemaining + " giờ</strong></div>" +
        '<div>Quy tắc áp dụng: <span class="rule-tag ' + calc.ruleCode.toLowerCase() + '">' + calc.ruleCode + "</span></div>" +
      "</div>" +
      '<div style="background:#edf2f7; padding:8px 10px; font-size:10px;">' +
        "<strong>Chi tiết chính sách:</strong> " + escapeHTML(calc.ruleDescription) +
      "</div>" +
      '<div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid #e2e8f0;">' +
        "<span>Tiền cọc đã đóng: <strong>" + formatMoney(calc.depositAmount) + "</strong></span>" +
        "<span>Tỷ lệ hoàn: <strong>" + calc.refundPercentText + "</strong></span>" +
        '<span style="font-size:12px;">Số tiền hoàn dự kiến: <strong style="color:#8c2824; font-size:14px;">' + formatMoney(calc.refundAmount) + "</strong></span>" +
      "</div>";

    cancelDialog.showModal();
  }

  if (cancelConfirmBtn) {
    cancelConfirmBtn.addEventListener("click", async function () {
      if (!activeCancellingBooking || !activeRefundCalculation) return;

      cancelConfirmBtn.disabled = true;
      cancelConfirmBtn.textContent = "Đang xử lý hủy...";

      try {
        await StaffAPI.cancelBooking(activeCancellingBooking.id, activeRefundCalculation);
        cancelDialog.close();
        showToast("Đã hủy booking #" + (activeCancellingBooking.booking_code || activeCancellingBooking.id) +
          ". Tiền hoàn dự kiến: " + formatMoney(activeRefundCalculation.refundAmount) + ".");
        await fetchBookings();
      } catch (error) {
        showToast("Lỗi khi hủy booking: " + error.message, true);
      } finally {
        cancelConfirmBtn.disabled = false;
        cancelConfirmBtn.textContent = "Xác nhận hủy booking";
        activeCancellingBooking = null;
        activeRefundCalculation = null;
      }
    });
  }

  if (cancelAbortBtn) {
    cancelAbortBtn.addEventListener("click", function () {
      cancelDialog.close();
    });
  }

  if (closeCancelBtn) {
    closeCancelBtn.addEventListener("click", function () {
      cancelDialog.close();
    });
  }

  // ==========================================
  // 9. NẠP DANH SÁCH PHÒNG & TỰ ĐỘNG DỰ TÍNH CHI PHÍ
  // ==========================================
  async function loadRoomsForSelect() {
    if (!roomSelect) return;
    try {
      var res = await StaffAPI.getRooms();
      availableRooms = Array.isArray(res.data) ? res.data : [];

      var optionsHtml = '<option value="">-- Chọn phòng lưu trú --</option>' +
        availableRooms.map(function (r) {
          var isAvail = (r.status === "available");
          var statusDesc = isAvail ? "Khả dụng" : (r.status === "occupied" ? "Đang ở" : "Bảo trì/Dơ");
          var disabledAttr = isAvail ? "" : " disabled";
          return '<option value="' + r.id + '" data-price="' + r.price_per_night + '" data-type="' + r.room_type + '"' + disabledAttr + ">" +
            r.room_number + " - " + r.room_type + " (" + formatMoney(r.price_per_night) + "/đêm) " + (!isAvail ? "[" + statusDesc + "]" : "") +
          "</option>";
        }).join("");

      roomSelect.innerHTML = optionsHtml;
    } catch (e) {
      roomSelect.innerHTML = '<option value="">(Không thể tải danh sách phòng từ API)</option>';
    }
  }

  function calculateCurrentFormCost() {
    if (!roomSelect || !checkInInput || !checkOutInput) {
      return { nights: 0, totalAmount: 0, depositAmount: 0, basePrice: 0 };
    }

    var selectedOpt = roomSelect.selectedOptions ? roomSelect.selectedOptions[0] : null;
    var costRoomId = roomSelect.value;
    var costCheckIn = checkInInput.value;
    var costCheckOut = checkOutInput.value;

    if (!costRoomId || !costCheckIn || !costCheckOut || costCheckOut <= costCheckIn) {
      return { nights: 0, totalAmount: 0, depositAmount: 0, basePrice: 0 };
    }

    var unitPrice = selectedOpt ? (Number(selectedOpt.dataset.price) || 0) : 0;
    return StaffAPI.calculateStayCost({ price_per_night: unitPrice }, costCheckIn, costCheckOut);
  }

  function updateCostPreview() {
    if (!costPreviewBox) return;

    var costObj = calculateCurrentFormCost();
    if (costObj.nights > 0) {
      costPreviewBox.hidden = false;
      var nightsEl = $("#preview-nights");
      var basePriceEl = $("#preview-base-price");
      var totalCostEl = $("#preview-total-cost");
      var depositCostEl = $("#preview-deposit-cost");

      if (nightsEl) nightsEl.textContent = costObj.nights + " đêm";
      if (basePriceEl) basePriceEl.textContent = formatMoney(costObj.basePrice) + "/đêm";
      if (totalCostEl) totalCostEl.textContent = formatMoney(costObj.totalAmount);
      if (depositCostEl) {
        depositCostEl.textContent = formatMoney(costObj.depositAmount) +
          (costObj.nights >= 2 ? " (Áp dụng BR-04/05)" : " (Dưới 2 đêm: không bắt buộc cọc)");
      }
    } else {
      costPreviewBox.hidden = true;
    }
  }

  if (roomSelect) roomSelect.addEventListener("change", updateCostPreview);
  if (checkInInput) checkInInput.addEventListener("change", updateCostPreview);
  if (checkOutInput) checkOutInput.addEventListener("change", updateCostPreview);

  // ==========================================
  // 10. TẠO ĐẶT PHÒNG MỚI (VALIDATION CHẶT CHẼ)
  // ==========================================
  if (bookingForm) {
    bookingForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (formFeedback) formFeedback.hidden = true;

      var guestNameInput = $("#booking-guest-name");
      var guestPhoneInput = $("#booking-guest-phone");

      var submitGuestName = guestNameInput ? guestNameInput.value.trim() : "";
      var submitGuestPhone = guestPhoneInput ? guestPhoneInput.value.trim() : "";
      var submitRoomId = roomSelect ? Number(roomSelect.value) : 0;
      var submitCheckIn = checkInInput ? checkInInput.value : "";
      var submitCheckOut = checkOutInput ? checkOutInput.value : "";

      // Kiểm tra hợp lệ bắt buộc
      if (!submitGuestName || !submitGuestPhone || !submitRoomId || !submitCheckIn || !submitCheckOut) {
        if (formFeedback) {
          formFeedback.textContent = "Vui lòng điền đầy đủ tất cả các trường bắt buộc (*).";
          formFeedback.hidden = false;
        }
        return;
      }

      // Kiểm tra định dạng số điện thoại
      var phoneDigitsOnly = submitGuestPhone.replace(/[\s\-\.]/g, "");
      if (!/^[0-9+]{10,15}$/.test(phoneDigitsOnly)) {
        if (formFeedback) {
          formFeedback.textContent = "Số điện thoại không hợp lệ (yêu cầu từ 10 đến 15 chữ số).";
          formFeedback.hidden = false;
        }
        return;
      }

      // Kiểm tra logic ngày lưu trú
      if (submitCheckOut <= submitCheckIn) {
        if (formFeedback) {
          formFeedback.textContent = "Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 ngày.";
          formFeedback.hidden = false;
        }
        return;
      }

      var costCalculated = calculateCurrentFormCost();

      if (submitBookingBtn) {
        submitBookingBtn.disabled = true;
        submitBookingBtn.textContent = "Đang tạo đặt phòng...";
      }

      var bookingPayload = {
        guest_name: submitGuestName,
        guest_phone: submitGuestPhone,
        room_ids: [submitRoomId],
        room_id: submitRoomId,
        check_in_date: submitCheckIn,
        check_out_date: submitCheckOut,
        total_room_amount: costCalculated.totalAmount,
        deposit_amount: costCalculated.depositAmount,
        status: "confirmed"
      };

      try {
        var createRes = await StaffAPI.createBooking(bookingPayload);
        createDialog.close();
        bookingForm.reset();
        if (costPreviewBox) costPreviewBox.hidden = true;

        var createdCode = createRes.data && (createRes.data.booking_code || createRes.data.id)
          ? (createRes.data.booking_code || createRes.data.id)
          : "Mới";

        showToast("Tạo thành công đặt phòng #" + createdCode + ".");
        await fetchBookings();
      } catch (error) {
        if (formFeedback) {
          formFeedback.innerHTML = "<strong>Lỗi từ máy chủ:</strong> " + escapeHTML(error.message);
          formFeedback.hidden = false;
        }
      } finally {
        if (submitBookingBtn) {
          submitBookingBtn.disabled = false;
          submitBookingBtn.textContent = "Xác nhận đặt phòng";
        }
      }
    });
  }

  // ==========================================
  // 11. SỰ KIỆN TƯƠNG TÁC BẢNG & BỘ LỌC
  // ==========================================
  if (tableBody) {
    tableBody.addEventListener("click", function (event) {
      var actionBtn = event.target.closest("button[data-action]");
      if (!actionBtn) return;

      var actionType = actionBtn.dataset.action;
      var actionId = actionBtn.dataset.id;

      if (actionType === "detail") showDetails(actionId);
      if (actionType === "cancel") openCancelModal(actionId);
    });
  }

  if (searchInput) searchInput.addEventListener("input", renderBookings);
  if (statusFilter) statusFilter.addEventListener("input", renderBookings);
  if (dateFilter) dateFilter.addEventListener("input", renderBookings);

  var resetFiltersBtn = $("#reset-filters");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", function () {
      if (searchInput) searchInput.value = "";
      if (statusFilter) statusFilter.value = "all";
      if (dateFilter) dateFilter.value = "";
      renderBookings();
    });
  }

  // Mở modal tạo mới
  var openCreateModalBtn = $("#open-create-modal");
  if (openCreateModalBtn) {
    openCreateModalBtn.addEventListener("click", function () {
      if (bookingForm) bookingForm.reset();
      if (formFeedback) formFeedback.hidden = true;
      if (costPreviewBox) costPreviewBox.hidden = true;
      loadRoomsForSelect();

      var todayStr = new Date().toISOString().split("T")[0];
      var tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      if (checkInInput) {
        checkInInput.min = todayStr;
        checkInInput.value = todayStr;
      }
      if (checkOutInput) {
        checkOutInput.min = tomorrowStr;
        checkOutInput.value = tomorrowStr;
      }

      createDialog.showModal();
    });
  }

  var closeDialogBtn = $("#close-dialog");
  if (closeDialogBtn) closeDialogBtn.addEventListener("click", function () { createDialog.close(); });

  var cancelDialogBtn = $("#cancel-dialog");
  if (cancelDialogBtn) cancelDialogBtn.addEventListener("click", function () { createDialog.close(); });

  var closeDetailBtn = $("#close-detail");
  if (closeDetailBtn) closeDetailBtn.addEventListener("click", function () { detailDialog.close(); });

  var closeDetailFooterBtn = $("#close-detail-footer");
  if (closeDetailFooterBtn) closeDetailFooterBtn.addEventListener("click", function () { detailDialog.close(); });

  // Điều khiển chế độ API / Mock Mode
  if (modeToggleBtn) {
    modeToggleBtn.addEventListener("click", function () {
      var isNowMock = StaffAPI.toggleMockMode();
      showToast(isNowMock
        ? "Đã bật: DỮ LIỆU MÔ PHỎNG / CHỜ TÍCH HỢP API."
        : "Đã chuyển về: KẾT NỐI API BACKEND THẬT.");
      fetchBookings();
    });
  }

  if (switchToApiBtn) {
    switchToApiBtn.addEventListener("click", function () {
      StaffAPI.setMockMode(false);
      showToast("Đã chuyển về kết nối API Backend thật.");
      fetchBookings();
    });
  }

  if (enableMockBtn) {
    enableMockBtn.addEventListener("click", function () {
      StaffAPI.setMockMode(true);
      showToast("Đã bật DỮ LIỆU MÔ PHỎNG / CHỜ TÍCH HỢP API.");
      fetchBookings();
    });
  }

  if (retryFetchBtn) {
    retryFetchBtn.addEventListener("click", function () {
      fetchBookings();
    });
  }

  window.addEventListener("staff:mode-change", function () {
    fetchBookings();
  });

  // Sidebar toggle trên màn hình nhỏ
  var sidebarEl = $("#sidebar");
  var menuToggleBtn = $("#menu-toggle");
  var backdropEl = $("#sidebar-backdrop");

  if (menuToggleBtn) {
    menuToggleBtn.addEventListener("click", function () {
      var isOpen = menuToggleBtn.getAttribute("aria-expanded") !== "true";
      if (sidebarEl) sidebarEl.classList.toggle("is-open", isOpen);
      menuToggleBtn.setAttribute("aria-expanded", String(isOpen));
      if (backdropEl) backdropEl.hidden = !isOpen;
    });
  }

  if (backdropEl) {
    backdropEl.addEventListener("click", function () {
      if (sidebarEl) sidebarEl.classList.remove("is-open");
      if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", "false");
      backdropEl.hidden = true;
    });
  }

  // Cập nhật nhãn ngày hôm nay
  var todayLabelEl = $("#today-label");
  if (todayLabelEl) {
    todayLabelEl.textContent = new Intl.DateTimeFormat("vi-VN", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date());
  }

  // ==========================================
  // 12. KHỞI CHẠY TẢI DỮ LIỆU
  // ==========================================
  fetchBookings();
});
