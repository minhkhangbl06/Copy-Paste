/**
 * Hotel Reservation System - Front Desk Check-in / Check-out Module
 * File: HotelReservation/frontend/staff/js/checkin.js
 * Author: Pham Quang Duy (Staff Frontend Lead)
 *
 * Nghiệp vụ:
 * 1. Check-in: Tiếp nhận khách có đơn confirmed, kiểm tra buồng phòng sẵn sàng, chuyển trạng thái sang checked_in.
 * 2. Check-out: Tính tổng chi phí (tiền phòng + dịch vụ phòng + phụ phí trễ BR-03 - tiền cọc), thu tiền và chuyển phòng sang dirty để dọn dẹp.
 */

document.addEventListener("DOMContentLoaded", function () {
  'use strict';

  // DOM Elements - Shell & Controls
  var sidebarElem = document.getElementById("sidebar");
  var menuToggleBtn = document.getElementById("menu-toggle");
  var backdropElem = document.getElementById("sidebar-backdrop");
  var todayLabelElem = document.getElementById("today-label");
  var refreshBtn = document.getElementById("refresh-btn");
  var toastElem = document.getElementById("toast");

  // Mode badge & controls
  var modeBadgeElem = document.getElementById("mode-badge");
  var modeToggleBtnElem = document.getElementById("mode-toggle-btn");
  var modeNoticeBannerElem = document.getElementById("mode-notice-banner");
  var switchToApiBtnElem = document.getElementById("switch-to-api-btn");
  var enableMockBtnElem = document.getElementById("enable-mock-btn");
  var retryBtnElem = document.getElementById("retry-btn");

  // Loading & Error States
  var checkinLoadingElem = document.getElementById("checkin-loading");
  var checkinErrorElem = document.getElementById("checkin-error");
  var checkinErrorMsgElem = document.getElementById("checkin-error-msg");

  // Summary Cards
  var statArrivalsElem = document.getElementById("stat-arrivals");
  var statStayingElem = document.getElementById("stat-staying");
  var statDeparturesElem = document.getElementById("stat-departures");

  // Tab & Filters
  var tabAllBtn = document.getElementById("tab-all");
  var tabArrivalBtn = document.getElementById("tab-arrival");
  var tabStayingBtn = document.getElementById("tab-staying");
  var badgeCountAll = document.getElementById("badge-count-all");
  var badgeCountArrival = document.getElementById("badge-count-arrival");
  var badgeCountStaying = document.getElementById("badge-count-staying");
  var searchInputElem = document.getElementById("checkin-search");

  // Table & Empty
  var tableBodyElem = document.getElementById("checkin-table-body");
  var emptyStateElem = document.getElementById("empty-state");

  // Check-in Dialog
  var checkinConfirmDialog = document.getElementById("checkin-confirm-dialog");
  var checkinConfirmBody = document.getElementById("checkin-confirm-body");
  var closeCheckinDialogBtn = document.getElementById("close-checkin-dialog");
  var cancelCheckinBtn = document.getElementById("cancel-checkin-btn");
  var confirmCheckinBtn = document.getElementById("confirm-checkin-btn");

  // Check-out Dialog
  var checkoutDialog = document.getElementById("checkout-dialog");
  var checkoutBody = document.getElementById("checkout-body");
  var closeCheckoutDialogBtn = document.getElementById("close-checkout-dialog");
  var cancelCheckoutBtn = document.getElementById("cancel-checkout-btn");
  var confirmCheckoutBtn = document.getElementById("confirm-checkout-btn");

  // State
  var allBookingsCache = [];
  var allRoomsCache = [];
  var currentTab = "all"; // "all" | "arrival" | "staying"
  var activeCheckinBooking = null;
  var activeCheckoutBooking = null;
  var activeInvoicePreview = null;
  var toastTimerId = null;

  // 1. Cập nhật ngày hôm nay
  if (todayLabelElem) {
    try {
      todayLabelElem.textContent = new Intl.DateTimeFormat("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(new Date());
    } catch (e) {
      todayLabelElem.textContent = new Date().toLocaleDateString("vi-VN");
    }
  }

  // 2. Sidebar Mobile
  function toggleSidebar(isOpen) {
    if (sidebarElem) sidebarElem.classList.toggle("is-open", isOpen);
    if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", String(isOpen));
    if (backdropElem) backdropElem.hidden = !isOpen;
    document.body.classList.toggle("menu-open", isOpen);
  }

  if (menuToggleBtn) {
    menuToggleBtn.addEventListener("click", function () {
      var open = menuToggleBtn.getAttribute("aria-expanded") !== "true";
      toggleSidebar(open);
    });
  }

  if (backdropElem) {
    backdropElem.addEventListener("click", function () {
      toggleSidebar(false);
    });
  }

  // 3. Quản lý Mode UI
  function updateModeUI() {
    if (typeof StaffAPI === 'undefined') return;
    var info = StaffAPI.getModeInfo();

    if (modeBadgeElem) {
      modeBadgeElem.textContent = info.badgeText;
      modeBadgeElem.className = "mode-badge " + info.badgeClass;
    }
    if (modeNoticeBannerElem) {
      modeNoticeBannerElem.hidden = !info.isMock;
    }
  }

  if (modeToggleBtnElem) {
    modeToggleBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      StaffAPI.toggleMockMode();
      updateModeUI();
      loadAllData();
    });
  }

  if (switchToApiBtnElem) {
    switchToApiBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      StaffAPI.setMockMode(false);
      updateModeUI();
      loadAllData();
    });
  }

  if (enableMockBtnElem) {
    enableMockBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      StaffAPI.setMockMode(true);
      updateModeUI();
      loadAllData();
    });
  }

  if (retryBtnElem) {
    retryBtnElem.addEventListener("click", function () {
      loadAllData();
    });
  }

  window.addEventListener('staff:mode-change', function () {
    updateModeUI();
    loadAllData();
  });

  // 4. Toast Thông báo
  function showToast(message, type) {
    if (!toastElem) return;
    clearTimeout(toastTimerId);
    toastElem.textContent = message;
    toastElem.className = "toast show " + (type === "error" ? "toast-error" : "toast-success");
    toastElem.hidden = false;
    toastTimerId = setTimeout(function () {
      toastElem.classList.remove("show");
      toastElem.hidden = true;
    }, 3500);
  }

  // 5. Tiện ích Định dạng
  function formatVND(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0);
  }

  function formatDateVN(dateStr) {
    if (!dateStr) return '—';
    var parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
    return dateStr;
  }

  function safeEscape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .split('&').join('&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;')
      .split('"').join('&quot;')
      .split("'").join('&#39;');
  }

  function getRoomBadgeHTML(room) {
    if (!room) return '<span class="room-badge">—</span>';
    var st = room.status || 'available';
    if (st === 'available') {
      return '<span class="room-badge room-ready">✓ Sẵn sàng</span>';
    } else if (st === 'dirty') {
      return '<span class="room-badge room-dirty">⚠ Cần dọn</span>';
    } else if (st === 'occupied') {
      return '<span class="room-badge room-occupied">● Đang ở</span>';
    } else if (st === 'maintenance') {
      return '<span class="room-badge room-maintenance">✕ Bảo trì</span>';
    }
    return '<span class="room-badge">' + safeEscape(st) + '</span>';
  }

  // 6. Tải dữ liệu chính từ API
  async function loadAllData() {
    if (typeof StaffAPI === 'undefined') return;

    if (checkinLoadingElem) checkinLoadingElem.hidden = false;
    if (checkinErrorElem) checkinErrorElem.hidden = true;

    try {
      var roomsPromise = StaffAPI.getRooms();
      var bookingsPromise = StaffAPI.getBookings();

      var results = await Promise.all([roomsPromise, bookingsPromise]);
      allRoomsCache = results[0].data || [];
      allBookingsCache = results[1].data || [];

      // Đồng bộ thông tin phòng vào từng booking nếu chưa có
      for (var i = 0; i < allBookingsCache.length; i++) {
        var b = allBookingsCache[i];
        if (!b.room && b.room_id) {
          var matchedRoom = allRoomsCache.find(function (r) { return r.id === b.room_id; });
          if (matchedRoom) b.room = matchedRoom;
        }
      }

      updateSummaryCounts();
      renderTable();

      if (checkinLoadingElem) checkinLoadingElem.hidden = true;
    } catch (err) {
      if (checkinLoadingElem) checkinLoadingElem.hidden = true;
      if (checkinErrorElem) {
        checkinErrorElem.hidden = false;
        if (checkinErrorMsgElem) {
          checkinErrorMsgElem.textContent = 'Lỗi truy vấn: ' + (err.message || 'Không thể lấy dữ liệu từ máy chủ.');
        }
      }
    }
  }

  // 7. Cập nhật Thống kê
  function updateSummaryCounts() {
    var arrivals = 0;
    var staying = 0;
    var departures = 0;

    var todayStr = new Date().toISOString().slice(0, 10);

    for (var i = 0; i < allBookingsCache.length; i++) {
      var item = allBookingsCache[i];
      if (item.status === 'confirmed') arrivals++;
      if (item.status === 'checked_in') {
        staying++;
        if (item.check_out_date && item.check_out_date <= todayStr) {
          departures++;
        }
      }
    }

    if (statArrivalsElem) statArrivalsElem.textContent = String(arrivals);
    if (statStayingElem) statStayingElem.textContent = String(staying);
    if (statDeparturesElem) statDeparturesElem.textContent = String(departures);

    if (badgeCountAll) badgeCountAll.textContent = String(allBookingsCache.length);
    if (badgeCountArrival) badgeCountArrival.textContent = String(arrivals);
    if (badgeCountStaying) badgeCountStaying.textContent = String(staying);
  }

  // 8. Hiển thị Bảng Dữ Liệu
  function renderTable() {
    if (!tableBodyElem) return;

    var kw = searchInputElem ? searchInputElem.value.trim().toLowerCase() : '';

    var filtered = allBookingsCache.filter(function (b) {
      // Lọc theo Tab
      if (currentTab === 'arrival' && b.status !== 'confirmed') return false;
      if (currentTab === 'staying' && b.status !== 'checked_in') return false;

      // Lọc theo từ khóa
      if (kw) {
        var str = (String(b.booking_code || '') + ' ' +
          String(b.guest_name || '') + ' ' +
          String(b.guest_phone || '') + ' ' +
          (b.room ? (b.room.room_number + ' ' + b.room.room_type) : '')).toLowerCase();
        if (str.indexOf(kw) === -1) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      tableBodyElem.innerHTML = '';
      if (emptyStateElem) {
        emptyStateElem.hidden = false;
        emptyStateElem.textContent = kw
          ? 'Không tìm thấy đơn đặt phòng phù hợp với từ khóa "' + kw + '".'
          : 'Không có đơn đặt phòng nào trong danh mục này.';
      }
      return;
    }

    if (emptyStateElem) emptyStateElem.hidden = true;

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var b = filtered[i];
      var roomTitle = b.room
        ? ('Phòng ' + (b.room.room_number || '—') + ' (' + b.room.room_type + ')')
        : ('Phòng #' + (b.room_id || '—'));
      var roomStatusBadge = getRoomBadgeHTML(b.room);

      var statusBadge = '';
      if (b.status === 'confirmed') {
        statusBadge = '<span class="status status-confirmed">Đã xác nhận</span>';
      } else if (b.status === 'checked_in') {
        statusBadge = '<span class="status status-checked">Đang lưu trú</span>';
      } else if (b.status === 'checked_out') {
        statusBadge = '<span class="status status-checked" style="background:#f1f5f9; color:#475569;">Đã trả phòng</span>';
      } else if (b.status === 'cancelled') {
        statusBadge = '<span class="status status-cancelled">Đã hủy</span>';
      } else {
        statusBadge = '<span class="status status-pending">Chờ xử lý</span>';
      }

      // Nút Thao tác
      var actionBtn = '';
      if (b.status === 'confirmed') {
        actionBtn = '<button class="btn-checkin-action action-trigger-checkin" data-id="' + b.id + '" type="button">→ Check-in</button>';
      } else if (b.status === 'checked_in') {
        actionBtn = '<button class="btn-checkout-action action-trigger-checkout" data-id="' + b.id + '" type="button">Thanh toán &amp; Check-out</button>';
      } else {
        actionBtn = '<small style="color:var(--text-secondary);">Hoàn tất</small>';
      }

      html += '<tr>' +
        '<td class="booking-code">' + safeEscape(b.booking_code || ('#BK-' + b.id)) + '</td>' +
        '<td><strong>' + safeEscape(b.guest_name || 'Khách vãng lai') + '</strong><br><small style="color:var(--text-secondary);">' + safeEscape(b.guest_phone || '—') + '</small></td>' +
        '<td><strong>' + safeEscape(roomTitle) + '</strong></td>' +
        '<td>' + roomStatusBadge + '</td>' +
        '<td>' + safeEscape(formatDateVN(b.check_in_date)) + '</td>' +
        '<td>' + safeEscape(formatDateVN(b.check_out_date)) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="text-align: right;">' + actionBtn + '</td>' +
        '</tr>';
    }

    tableBodyElem.innerHTML = html;
    bindTableActionEvents();
  }

  // 9. Gán sự kiện cho các nút hành động trong bảng
  function bindTableActionEvents() {
    if (!tableBodyElem) return;

    var checkinButtons = tableBodyElem.querySelectorAll(".action-trigger-checkin");
    checkinButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        openCheckinDialog(id);
      });
    });

    var checkoutButtons = tableBodyElem.querySelectorAll(".action-trigger-checkout");
    checkoutButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        openCheckoutDialog(id);
      });
    });
  }

  // 10. Mở Modal Check-in
  function openCheckinDialog(bookingId) {
    activeCheckinBooking = allBookingsCache.find(function (b) { return String(b.id) === String(bookingId); });
    if (!activeCheckinBooking || !checkinConfirmBody || !checkinConfirmDialog) return;

    var room = activeCheckinBooking.room;
    var isRoomDirty = room && room.status === 'dirty';
    var isRoomMaintenance = room && room.status === 'maintenance';

    var warningHtml = '';
    if (isRoomDirty) {
      warningHtml = '<div class="notice-banner banner-api-error" style="margin-bottom: 14px;">' +
        '<span><strong>⚠️ CẢNH BÁO BUỒNG PHÒNG:</strong> Phòng này hiện có trạng thái <em>Cần dọn (Dirty)</em>. Vui lòng xác nhận phòng đã được vệ sinh sạch sẽ trước khi giao chìa khóa cho khách.</span>' +
        '</div>';
    } else if (isRoomMaintenance) {
      warningHtml = '<div class="notice-banner banner-api-error" style="margin-bottom: 14px;">' +
        '<span><strong>✕ CẢNH BÁO:</strong> Phòng đang trong diện <em>Bảo trì (Maintenance)</em>. Không thể làm thủ tục nhận phòng này.</span>' +
        '</div>';
    }

    var content = warningHtml +
      '<div class="detail-grid" style="margin-bottom: 16px;">' +
      '<div class="detail-item"><span class="detail-label">Mã đặt phòng</span><strong class="detail-value booking-code">' + safeEscape(activeCheckinBooking.booking_code) + '</strong></div>' +
      '<div class="detail-item"><span class="detail-label">Khách hàng</span><strong class="detail-value">' + safeEscape(activeCheckinBooking.guest_name) + '</strong></div>' +
      '<div class="detail-item"><span class="detail-label">Số điện thoại</span><strong class="detail-value">' + safeEscape(activeCheckinBooking.guest_phone || '—') + '</strong></div>' +
      '<div class="detail-item"><span class="detail-label">Phòng tiếp nhận</span><strong class="detail-value">' + safeEscape(room ? (room.room_type + ' - Phòng ' + room.room_number) : 'Chưa gán') + '</strong></div>' +
      '<div class="detail-item"><span class="detail-label">Thời gian lưu trú</span><strong class="detail-value">' + safeEscape(formatDateVN(activeCheckinBooking.check_in_date)) + ' → ' + safeEscape(formatDateVN(activeCheckinBooking.check_out_date)) + '</strong></div>' +
      '<div class="detail-item"><span class="detail-label">Tiền cọc đã đóng</span><strong class="detail-value" style="color:#0b6b3a;">' + safeEscape(formatVND(activeCheckinBooking.deposit_amount)) + '</strong></div>' +
      '</div>' +
      '<p style="font-size: 12px; color: var(--text-secondary); margin: 0;">' +
      'Thủ tục nhận phòng tiêu chuẩn bắt đầu từ <strong>14:00</strong>. Khi xác nhận, phòng sẽ được cập nhật trạng thái <strong>Đang sử dụng (Occupied)</strong>.' +
      '</p>';

    checkinConfirmBody.innerHTML = content;
    if (confirmCheckinBtn) confirmCheckinBtn.disabled = isRoomMaintenance;
    checkinConfirmDialog.showModal();
  }

  // Xác nhận Check-in
  if (confirmCheckinBtn) {
    confirmCheckinBtn.addEventListener("click", async function () {
      if (!activeCheckinBooking || typeof StaffAPI === 'undefined') return;
      confirmCheckinBtn.disabled = true;
      confirmCheckinBtn.textContent = 'Đang xử lý...';

      try {
        await StaffAPI.checkInBooking(activeCheckinBooking.id);
        showToast('Check-in thành công cho khách ' + activeCheckinBooking.guest_name + '! Phòng đã chuyển sang Occupied.', 'success');
        if (checkinConfirmDialog) checkinConfirmDialog.close();
        loadAllData();
      } catch (err) {
        showToast('Lỗi Check-in: ' + (err.message || 'Không thể cập nhật'), 'error');
      } finally {
        confirmCheckinBtn.disabled = false;
        confirmCheckinBtn.textContent = '✓ Xác nhận Nhận Phòng';
      }
    });
  }

  if (cancelCheckinBtn) {
    cancelCheckinBtn.addEventListener("click", function () {
      if (checkinConfirmDialog) checkinConfirmDialog.close();
    });
  }
  if (closeCheckinDialogBtn) {
    closeCheckinDialogBtn.addEventListener("click", function () {
      if (checkinConfirmDialog) checkinConfirmDialog.close();
    });
  }

  // 11. Mở Modal Check-out & Xem trước Hóa đơn
  async function openCheckoutDialog(bookingId) {
    activeCheckoutBooking = allBookingsCache.find(function (b) { return String(b.id) === String(bookingId); });
    if (!activeCheckoutBooking || !checkoutBody || !checkoutDialog || typeof StaffAPI === 'undefined') return;

    checkoutBody.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>Đang đối chiếu số liệu hóa đơn &amp; dịch vụ...</span></div>';
    checkoutDialog.showModal();

    try {
      var previewRes = await StaffAPI.getInvoicePreview(activeCheckoutBooking.id);
      activeInvoicePreview = previewRes.data || {};

      var roomCharge = Number(activeInvoicePreview.room_charges) || Number(activeCheckoutBooking.total_room_amount) || 0;
      var serviceCharge = Number(activeInvoicePreview.service_charges) || 0;
      var lateFee = Number(activeInvoicePreview.late_checkout_fee) || 0;
      var depositDeducted = Number(activeInvoicePreview.deposit_deducted) || Number(activeCheckoutBooking.deposit_amount) || 0;
      var netPayable = Math.max(0, roomCharge + serviceCharge + lateFee - depositDeducted);

      var receiptHtml = '<div class="checkout-receipt">' +
        '<div class="receipt-header">' +
        '<h3>HÓA ĐƠN TRẢ PHÒNG</h3>' +
        '<p>Khách hàng: <strong>' + safeEscape(activeCheckoutBooking.guest_name) + '</strong> | Mã: ' + safeEscape(activeCheckoutBooking.booking_code) + '</p>' +
        '<p>Phòng: ' + safeEscape(activeCheckoutBooking.room ? activeCheckoutBooking.room.room_number : ('#' + activeCheckoutBooking.room_id)) + ' (' + safeEscape(activeCheckoutBooking.room ? activeCheckoutBooking.room.room_type : '') + ')</p>' +
        '</div>' +
        '<div class="receipt-row"><span>Tiền phòng:</span><strong>' + formatVND(roomCharge) + '</strong></div>' +
        '<div class="receipt-row"><span>Dịch vụ phát sinh (F&amp;B / Minibar / Spa):</span><strong>' + formatVND(serviceCharge) + '</strong></div>';

      if (lateFee > 0) {
        receiptHtml += '<div class="receipt-row receipt-late-fee"><span>Phụ phí Check-out trễ (BR-03 sau 12:00):</span><strong>+' + formatVND(lateFee) + '</strong></div>';
      }

      receiptHtml += '<div class="receipt-row receipt-discount"><span>Khấu trừ tiền cọc đã đóng:</span><strong>-' + formatVND(depositDeducted) + '</strong></div>' +
        '<div class="receipt-row total-due"><span>TỔNG CỘNG THANH TOÁN:</span><strong style="font-size: 18px; color: var(--color-ink);">' + formatVND(netPayable) + '</strong></div>' +
        '</div>' +
        '<div class="payment-method-group">' +
        '<label>Phương thức thanh toán:</label>' +
        '<div class="payment-options">' +
        '<label class="payment-option-label"><input type="radio" name="checkout_pay_method" value="cash" checked> <span>Tiền mặt</span></label>' +
        '<label class="payment-option-label"><input type="radio" name="checkout_pay_method" value="card"> <span>Thẻ (POS)</span></label>' +
        '<label class="payment-option-label"><input type="radio" name="checkout_pay_method" value="transfer"> <span>Chuyển khoản QR</span></label>' +
        '</div>' +
        '</div>' +
        '<p style="font-size: 11px; color: var(--text-secondary); margin: 0;">' +
        'Lưu ý: Sau khi Check-out, phòng sẽ tự động chuyển sang trạng thái <strong>Cần dọn (Dirty)</strong> và chuyển giao cho bộ phận Housekeeping.' +
        '</p>';

      checkoutBody.innerHTML = receiptHtml;
    } catch (err) {
      checkoutBody.innerHTML = '<div class="error-state"><h3>Không thể tạo hóa đơn xem trước</h3><p>' + safeEscape(err.message) + '</p></div>';
    }
  }

  // Xác nhận Check-out
  if (confirmCheckoutBtn) {
    confirmCheckoutBtn.addEventListener("click", async function () {
      if (!activeCheckoutBooking || typeof StaffAPI === 'undefined') return;
      var selectedMethodElem = document.querySelector('input[name="checkout_pay_method"]:checked');
      var payMethod = selectedMethodElem ? selectedMethodElem.value : 'cash';

      confirmCheckoutBtn.disabled = true;
      confirmCheckoutBtn.textContent = 'Đang thanh toán & xuất hóa đơn...';

      try {
        // Thực hiện Check-out
        await StaffAPI.checkOutBooking(activeCheckoutBooking.id);

        // Tạo hóa đơn lưu trữ nếu ở Mock Mode hoặc API hỗ trợ
        if (activeInvoicePreview && StaffAPI.isMockMode()) {
          var createdInv = MockRepository.createInvoice({
            booking_id: activeCheckoutBooking.id,
            booking_code: activeCheckoutBooking.booking_code,
            guest_name: activeCheckoutBooking.guest_name,
            room_charges: activeInvoicePreview.room_charges,
            service_charges: activeInvoicePreview.service_charges,
            late_checkout_fee: activeInvoicePreview.late_checkout_fee,
            deposit_deducted: activeInvoicePreview.deposit_deducted,
            total_amount: activeInvoicePreview.total_amount,
            status: 'paid'
          });
          StaffAPI.payInvoice(createdInv.id, payMethod);
        }

        showToast('Check-out thành công cho khách ' + activeCheckoutBooking.guest_name + '! Phòng đã chuyển sang Cần dọn (Dirty).', 'success');
        if (checkoutDialog) checkoutDialog.close();
        loadAllData();
      } catch (err) {
        showToast('Lỗi Check-out: ' + (err.message || 'Không thể hoàn tất'), 'error');
      } finally {
        confirmCheckoutBtn.disabled = false;
        confirmCheckoutBtn.textContent = 'Xác nhận Thanh toán & Trả phòng';
      }
    });
  }

  if (cancelCheckoutBtn) {
    cancelCheckoutBtn.addEventListener("click", function () {
      if (checkoutDialog) checkoutDialog.close();
    });
  }
  if (closeCheckoutDialogBtn) {
    closeCheckoutDialogBtn.addEventListener("click", function () {
      if (checkoutDialog) checkoutDialog.close();
    });
  }

  // 12. Xử lý Chuyển Tab
  function setActiveTab(tabKey, targetBtn) {
    currentTab = tabKey;
    [tabAllBtn, tabArrivalBtn, tabStayingBtn].forEach(function (btn) {
      if (btn) {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-selected', 'false');
      }
    });
    if (targetBtn) {
      targetBtn.classList.add('is-active');
      targetBtn.setAttribute('aria-selected', 'true');
    }
    renderTable();
  }

  if (tabAllBtn) {
    tabAllBtn.addEventListener("click", function () { setActiveTab('all', tabAllBtn); });
  }
  if (tabArrivalBtn) {
    tabArrivalBtn.addEventListener("click", function () { setActiveTab('arrival', tabArrivalBtn); });
  }
  if (tabStayingBtn) {
    tabStayingBtn.addEventListener("click", function () { setActiveTab('staying', tabStayingBtn); });
  }

  // 13. Tìm kiếm
  if (searchInputElem) {
    searchInputElem.addEventListener("input", function () {
      renderTable();
    });
  }

  // 14. Nút Tải Lại
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Đang tải...';
      loadAllData().finally(function () {
        refreshBtn.innerHTML = '<span aria-hidden="true">✓</span> Đã làm mới';
        setTimeout(function () {
          refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Tải lại danh sách';
        }, 1200);
      });
    });
  }

  // Khởi động
  updateModeUI();
  loadAllData();
});
