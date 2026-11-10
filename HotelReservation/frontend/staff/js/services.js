/**
 * Hotel Reservation System - Room Service Queue Module
 * File: HotelReservation/frontend/staff/js/services.js
 * Author: Pham Quang Duy (Staff Frontend Lead)
 *
 * Luồng trạng thái: pending → confirmed → in_progress → delivered
 * Nhân viên có thể cancel ở giai đoạn pending / confirmed.
 */

document.addEventListener("DOMContentLoaded", function () {
  'use strict';

  /* ── DOM References ── */
  var sidebarElem      = document.getElementById("sidebar");
  var menuToggleBtn    = document.getElementById("menu-toggle");
  var backdropElem     = document.getElementById("sidebar-backdrop");
  var todayLabelElem   = document.getElementById("today-label");
  var refreshBtn       = document.getElementById("refresh-btn");
  var toastElem        = document.getElementById("toast");

  var modeBadgeElem        = document.getElementById("mode-badge");
  var modeToggleBtnElem    = document.getElementById("mode-toggle-btn");
  var modeNoticeBannerElem = document.getElementById("mode-notice-banner");
  var switchToApiBtnElem   = document.getElementById("switch-to-api-btn");
  var enableMockBtnElem    = document.getElementById("enable-mock-btn");
  var retryBtnElem         = document.getElementById("retry-btn");

  var svcLoadingElem   = document.getElementById("svc-loading");
  var svcErrorElem     = document.getElementById("svc-error");
  var svcErrorMsgElem  = document.getElementById("svc-error-msg");

  var orderGridElem    = document.getElementById("service-order-grid");
  var emptyStateElem   = document.getElementById("empty-state");
  var svcTabsElem      = document.getElementById("svc-tabs");
  var svcSearchElem    = document.getElementById("svc-search");

  /* ── Status Labels & Next Step Map ── */
  var STATUS_LABELS = {
    pending:     'Chờ tiếp nhận',
    confirmed:   'Đã xác nhận',
    in_progress: 'Đang thực hiện',
    delivered:   'Đã giao',
    cancelled:   'Đã hủy'
  };
  var NEXT_STATUS = {
    pending:     'confirmed',
    confirmed:   'in_progress',
    in_progress: 'delivered'
  };
  var NEXT_BTN_LABEL = {
    pending:     'Xác nhận tiếp nhận →',
    confirmed:   'Bắt đầu thực hiện →',
    in_progress: 'Xác nhận đã giao ✓'
  };

  /* ── State ── */
  var allOrdersCache = [];
  var currentTab     = 'all';
  var toastTimerId   = null;

  /* ── 1. Ngày hiện tại ── */
  if (todayLabelElem) {
    try {
      todayLabelElem.textContent = new Intl.DateTimeFormat("vi-VN", {
        weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
      }).format(new Date());
    } catch (e) { todayLabelElem.textContent = new Date().toLocaleDateString("vi-VN"); }
  }

  /* ── 2. Sidebar Mobile ── */
  function setSidebarState(open) {
    if (sidebarElem)   sidebarElem.classList.toggle("is-open", open);
    if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", String(open));
    if (backdropElem)  backdropElem.hidden = !open;
    document.body.classList.toggle("menu-open", open);
  }
  if (menuToggleBtn) {
    menuToggleBtn.addEventListener("click", function () {
      setSidebarState(menuToggleBtn.getAttribute("aria-expanded") !== "true");
    });
  }
  if (backdropElem) backdropElem.addEventListener("click", function () { setSidebarState(false); });

  /* ── 3. Mode UI ── */
  function updateModeUI() {
    if (typeof StaffAPI === 'undefined') return;
    var info = StaffAPI.getModeInfo();
    if (modeBadgeElem) { modeBadgeElem.textContent = info.badgeText; modeBadgeElem.className = "mode-badge " + info.badgeClass; }
    if (modeNoticeBannerElem) modeNoticeBannerElem.hidden = !info.isMock;
  }
  if (modeToggleBtnElem) {
    modeToggleBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.toggleMockMode(); updateModeUI(); loadOrders(); });
  }
  if (switchToApiBtnElem) {
    switchToApiBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.setMockMode(false); updateModeUI(); loadOrders(); });
  }
  if (enableMockBtnElem) {
    enableMockBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.setMockMode(true); updateModeUI(); loadOrders(); });
  }
  if (retryBtnElem) retryBtnElem.addEventListener("click", function () { loadOrders(); });
  window.addEventListener('staff:mode-change', function () { updateModeUI(); loadOrders(); });

  /* ── 4. Toast ── */
  function showToast(message, type) {
    if (!toastElem) return;
    clearTimeout(toastTimerId);
    toastElem.textContent = message;
    toastElem.className   = "toast show " + (type === "error" ? "toast-error" : "toast-success");
    toastElem.hidden      = false;
    toastTimerId = setTimeout(function () { toastElem.classList.remove("show"); toastElem.hidden = true; }, 3200);
  }

  /* ── 5. Helpers ── */
  function safeEscape(str) {
    if (str == null) return '';
    return String(str).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
  }
  function formatVND(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0);
  }
  function formatDateTime(isoStr) {
    if (!isoStr) return '—';
    try {
      return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(isoStr));
    } catch (e) { return isoStr; }
  }

  /* ── 6. Tải đơn dịch vụ ── */
  async function loadOrders() {
    if (typeof StaffAPI === 'undefined') return;
    if (svcLoadingElem) svcLoadingElem.hidden = false;
    if (svcErrorElem)   svcErrorElem.hidden   = true;
    if (orderGridElem)  orderGridElem.innerHTML = '';

    try {
      var res = await StaffAPI.getServiceOrders();
      allOrdersCache = res.data || [];
      updateBadgeCounts();
      renderOrders();
      if (svcLoadingElem) svcLoadingElem.hidden = true;
    } catch (err) {
      if (svcLoadingElem) svcLoadingElem.hidden = true;
      if (svcErrorElem) {
        svcErrorElem.hidden = false;
        if (svcErrorMsgElem) svcErrorMsgElem.textContent = 'Lỗi: ' + (err.message || 'Không thể kết nối máy chủ.');
      }
    }
  }

  /* ── 7. Cập nhật Badge Counts ── */
  function updateBadgeCounts() {
    var counts = { pending: 0, confirmed: 0, in_progress: 0, delivered: 0, cancelled: 0 };
    allOrdersCache.forEach(function (o) {
      if (counts[o.status] !== undefined) counts[o.status]++;
    });
    var allCount = allOrdersCache.length;

    var ids = ['pending', 'confirmed', 'in_progress', 'delivered', 'cancelled'];
    ids.forEach(function (s) {
      var el = document.getElementById("svc-badge-" + s);
      if (el) el.textContent = String(counts[s]);
      var el2 = document.getElementById("svc-count-" + s);
      if (el2) el2.textContent = String(counts[s]);
    });
    var badgeAll = document.getElementById("svc-badge-all");
    if (badgeAll) badgeAll.textContent = String(allCount);
  }

  /* ── 8. Render Order Cards ── */
  function renderOrders() {
    if (!orderGridElem) return;

    var kw = svcSearchElem ? svcSearchElem.value.trim().toLowerCase() : '';

    var filtered = allOrdersCache.filter(function (o) {
      if (currentTab !== 'all' && o.status !== currentTab) return false;
      if (kw) {
        var haystack = (String(o.order_code || '') + ' ' +
          String(o.booking ? o.booking.guest_name : '') + ' ' +
          String(o.room ? o.room.room_number : '')).toLowerCase();
        if (haystack.indexOf(kw) === -1) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      orderGridElem.innerHTML = '';
      if (emptyStateElem) emptyStateElem.hidden = false;
      return;
    }
    if (emptyStateElem) emptyStateElem.hidden = true;

    var html = '';
    filtered.forEach(function (order) {
      var statusLabel = STATUS_LABELS[order.status] || order.status;
      var guestName   = order.booking ? order.booking.guest_name : '—';
      var bookingCode = order.booking ? order.booking.booking_code : '—';
      var roomNum     = order.room    ? order.room.room_number     : (order.room_id ? '#' + order.room_id : '—');

      /* Items List */
      var itemsHtml = '';
      var items = order.items || [];
      items.forEach(function (it) {
        itemsHtml +=
          '<li>' +
            '<span>' + safeEscape(it.service_name || 'Dịch vụ') + ' x' + (it.quantity || 1) + '</span>' +
            '<span>' + formatVND(it.subtotal || it.unit_price * it.quantity) + '</span>' +
          '</li>';
      });
      if (!itemsHtml) itemsHtml = '<li><span style="color:var(--text-secondary);">Không có chi tiết sản phẩm</span></li>';

      /* Action Buttons */
      var actionsHtml = '';
      var nextSt = NEXT_STATUS[order.status];
      if (nextSt) {
        actionsHtml += '<button class="btn-svc-advance svc-advance-btn" data-id="' + order.id + '" data-to="' + nextSt + '" type="button">' +
          safeEscape(NEXT_BTN_LABEL[order.status]) + '</button>';
      }
      if (order.status === 'pending' || order.status === 'confirmed') {
        actionsHtml += '<button class="btn-svc-cancel svc-cancel-btn" data-id="' + order.id + '" type="button">Hủy đơn</button>';
      }
      if (!actionsHtml) {
        actionsHtml = '<span style="font-size:11px; color:var(--text-secondary);">' +
          (order.status === 'delivered' ? '✓ Đã hoàn tất giao dịch' : 'Đã hủy') + '</span>';
      }

      html +=
        '<div class="svc-order-card status-' + safeEscape(order.status) + '">' +
          '<div class="svc-card-header">' +
            '<div class="svc-order-code">' + safeEscape(order.order_code || ('#ORD-' + order.id)) + '</div>' +
            '<span class="svc-status-badge ' + safeEscape(order.status) + '">' + safeEscape(statusLabel) + '</span>' +
          '</div>' +
          '<div class="svc-card-body">' +
            '<div class="svc-meta">' +
              'Phòng: <strong>' + safeEscape(roomNum) + '</strong> &nbsp;|&nbsp; ' +
              'Khách: <strong>' + safeEscape(guestName) + '</strong><br>' +
              'Đặt phòng: <strong>' + safeEscape(bookingCode) + '</strong> &nbsp;|&nbsp; ' +
              'Lúc: ' + safeEscape(formatDateTime(order.created_at)) +
            '</div>' +
            '<ul class="svc-items-list">' + itemsHtml + '</ul>' +
            '<div class="svc-total-row">' +
              '<span>Tổng cộng:</span>' +
              '<span>' + formatVND(order.total_amount) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="svc-card-actions">' + actionsHtml + '</div>' +
        '</div>';
    });

    orderGridElem.innerHTML = html;
    bindCardActions();
  }

  /* ── 9. Gán sự kiện Card ── */
  function bindCardActions() {
    if (!orderGridElem) return;

    var advanceBtns = orderGridElem.querySelectorAll(".svc-advance-btn");
    advanceBtns.forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var orderId = btn.getAttribute("data-id");
        var toStatus = btn.getAttribute("data-to");
        btn.disabled = true;
        var orig = btn.textContent;
        btn.textContent = 'Đang cập nhật...';
        try {
          await StaffAPI.updateServiceOrderStatus(orderId, toStatus);
          var idx = allOrdersCache.findIndex(function (o) { return String(o.id) === String(orderId); });
          if (idx !== -1) allOrdersCache[idx].status = toStatus;
          showToast('Đơn ' + orderId + ': Chuyển sang "' + (STATUS_LABELS[toStatus] || toStatus) + '" thành công.', 'success');
          updateBadgeCounts();
          renderOrders();
        } catch (err) {
          showToast('Lỗi cập nhật trạng thái: ' + (err.message || 'Thất bại.'), 'error');
          btn.disabled = false;
          btn.textContent = orig;
        }
      });
    });

    var cancelBtns = orderGridElem.querySelectorAll(".svc-cancel-btn");
    cancelBtns.forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var orderId = btn.getAttribute("data-id");
        if (!window.confirm('Xác nhận hủy đơn dịch vụ #' + orderId + '?')) return;
        btn.disabled = true;
        try {
          await StaffAPI.updateServiceOrderStatus(orderId, 'cancelled');
          var idx = allOrdersCache.findIndex(function (o) { return String(o.id) === String(orderId); });
          if (idx !== -1) allOrdersCache[idx].status = 'cancelled';
          showToast('Đơn #' + orderId + ' đã hủy thành công.', 'success');
          updateBadgeCounts();
          renderOrders();
        } catch (err) {
          showToast('Lỗi hủy đơn: ' + (err.message || 'Thất bại.'), 'error');
          btn.disabled = false;
        }
      });
    });
  }

  /* ── 10. Tabs & Tìm kiếm ── */
  if (svcTabsElem) {
    svcTabsElem.addEventListener("click", function (e) {
      var btn = e.target.closest(".svc-tab-btn");
      if (!btn) return;
      currentTab = btn.getAttribute("data-status") || 'all';
      svcTabsElem.querySelectorAll(".svc-tab-btn").forEach(function (b) {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      renderOrders();
    });
  }
  if (svcSearchElem) svcSearchElem.addEventListener("input", renderOrders);

  /* ── 11. Nút làm mới ── */
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Đang tải...';
      loadOrders().finally(function () {
        refreshBtn.innerHTML = '<span aria-hidden="true">✓</span> Đã làm mới';
        setTimeout(function () { refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Làm mới hàng đợi'; }, 1200);
      });
    });
  }

  /* ── Khởi động ── */
  updateModeUI();
  loadOrders();
});
