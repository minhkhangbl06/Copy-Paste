/**
 * Hotel Reservation System - Reports & Analytics Module
 * File: HotelReservation/frontend/staff/js/reports.js
 * Author: Pham Quang Duy (Staff Frontend Lead)
 *
 * Nguồn dữ liệu: Tổng hợp từ StaffAPI.getDashboardSummary() + getBookings() + getRooms() + getInvoices() + getServiceOrders()
 * Hiển thị bằng CSS thuần (không phụ thuộc Chart.js hay thư viện bên ngoài).
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

  var reportErrorElem     = document.getElementById("report-error");
  var reportErrorMsgElem  = document.getElementById("report-error-msg");
  var reportLastUpdate    = document.getElementById("report-last-update");

  var kpiOccupancy     = document.getElementById("kpi-occupancy");
  var kpiRevenue       = document.getElementById("kpi-revenue");
  var kpiBookings      = document.getElementById("kpi-bookings");
  var kpiServices      = document.getElementById("kpi-services");
  var kpiOccupancySub  = document.getElementById("kpi-occupancy-sub");
  var kpiRevenueSub    = document.getElementById("kpi-revenue-sub");
  var kpiBookingsSub   = document.getElementById("kpi-bookings-sub");
  var kpiServicesSub   = document.getElementById("kpi-services-sub");

  var bookingStatusChart = document.getElementById("booking-status-chart");
  var roomStatusChart    = document.getElementById("room-status-chart");
  var reportDetailTable  = document.getElementById("report-detail-table");

  var rangeTabsContainer = document.querySelector(".range-tabs");

  /* ── State ── */
  var currentRange = 'today';
  var toastTimerId = null;

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
    modeToggleBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.toggleMockMode(); updateModeUI(); loadReportData(); });
  }
  if (switchToApiBtnElem) {
    switchToApiBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.setMockMode(false); updateModeUI(); loadReportData(); });
  }
  if (enableMockBtnElem) {
    enableMockBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.setMockMode(true); updateModeUI(); loadReportData(); });
  }
  if (retryBtnElem) retryBtnElem.addEventListener("click", function () { loadReportData(); });
  window.addEventListener('staff:mode-change', function () { updateModeUI(); loadReportData(); });

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
  function pct(count, total) {
    if (!total) return 0;
    return Math.round((count / total) * 1000) / 10;
  }

  /* ── 6. Render CSS Bar Chart ── */
  function renderBarChart(container, segments, maxVal) {
    if (!container) return;
    if (!maxVal) maxVal = 1;

    var html = '<div class="bar-chart-container">';
    segments.forEach(function (seg) {
      var heightPct = Math.max(4, Math.round((seg.value / maxVal) * 100));
      html +=
        '<div class="bar-col">' +
          '<div class="bar-label-top">' + safeEscape(String(seg.value)) + '</div>' +
          '<div class="bar-segment' + (seg.secondary ? ' bar-secondary' : '') + '" style="height:' + heightPct + '%;" title="' + safeEscape(seg.label) + ': ' + seg.value + '"></div>' +
          '<div class="bar-label-bottom">' + safeEscape(seg.label) + '</div>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  /* ── 7. Render Donut Chart (SVG) ── */
  function renderDonutChart(container, segments) {
    if (!container) return;

    var total = segments.reduce(function (s, seg) { return s + seg.value; }, 0);
    if (!total) {
      container.innerHTML = '<p style="color:var(--text-secondary); font-size:12px; text-align:center; padding:20px 0;">Chưa có dữ liệu</p>';
      return;
    }

    var size = 120;
    var r    = 44;
    var cx   = size / 2;
    var cy   = size / 2;
    var circumference = 2 * Math.PI * r;

    var svgPaths = '';
    var offset   = 0;
    segments.forEach(function (seg) {
      var fraction = seg.value / total;
      var dash     = circumference * fraction;
      var gap      = circumference - dash;
      svgPaths +=
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none"' +
          ' stroke="' + safeEscape(seg.color) + '"' +
          ' stroke-width="20"' +
          ' stroke-dasharray="' + dash.toFixed(2) + ' ' + gap.toFixed(2) + '"' +
          ' stroke-dashoffset="' + ((-offset * circumference / total) + circumference / 4).toFixed(2) + '"' +
          ' transform="rotate(-90, ' + cx + ', ' + cy + ')"/>';
      offset += seg.value;
    });

    var legendHtml = '';
    segments.forEach(function (seg) {
      legendHtml +=
        '<div class="donut-legend-item">' +
          '<div class="donut-swatch" style="background:' + safeEscape(seg.color) + ';"></div>' +
          '<div>' +
            safeEscape(seg.label) + '<br>' +
            '<strong>' + seg.value + '</strong> <span style="font-size:11px; color:var(--text-secondary);">(' + pct(seg.value, total).toFixed(1) + '%)</span>' +
          '</div>' +
        '</div>';
    });

    var html =
      '<div class="donut-wrap">' +
        '<svg class="donut-svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#f1f5f9" stroke-width="20"/>' +
          svgPaths +
          '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#233e57">' + total + '</text>' +
        '</svg>' +
        '<div class="donut-legend">' + legendHtml + '</div>' +
      '</div>';

    container.innerHTML = html;
  }

  /* ── 8. Render Bảng Chi Tiết Booking ── */
  function renderDetailTable(bookings) {
    if (!reportDetailTable) return;

    var statuses = ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'pending'];
    var labels   = {
      confirmed:   'Đã xác nhận',
      checked_in:  'Đang lưu trú',
      checked_out: 'Đã trả phòng',
      cancelled:   'Đã hủy',
      pending:     'Chờ xác nhận'
    };
    var colors = {
      confirmed:   '#2563eb',
      checked_in:  '#059669',
      checked_out: '#64748b',
      cancelled:   '#dc2626',
      pending:     '#d97706'
    };

    var total = bookings.length;
    var counts = {};
    statuses.forEach(function (s) { counts[s] = 0; });
    bookings.forEach(function (b) { if (counts[b.status] !== undefined) counts[b.status]++; });

    var html = '';
    statuses.forEach(function (s) {
      var count = counts[s];
      var ratio = pct(count, total).toFixed(1);
      html +=
        '<tr>' +
          '<td><span class="status status-' + (s === 'confirmed' ? 'confirmed' : s === 'cancelled' ? 'cancelled' : s === 'checked_in' ? 'checked' : 'pending') + '">' + safeEscape(labels[s]) + '</span></td>' +
          '<td style="text-align:right; font-weight:700; font-size:14px;">' + count + '</td>' +
          '<td style="text-align:right;">' + ratio + '%</td>' +
          '<td style="min-width:160px;">' +
            '<div class="report-progress-bar"><div class="report-progress-fill" style="width:' + ratio + '%; background:' + colors[s] + ';"></div></div>' +
          '</td>' +
        '</tr>';
    });

    reportDetailTable.innerHTML = html;
  }

  /* ── 9. Tải dữ liệu báo cáo ── */
  async function loadReportData() {
    if (typeof StaffAPI === 'undefined') return;
    if (reportErrorElem) reportErrorElem.hidden = true;

    try {
      var results = await Promise.all([
        StaffAPI.getRooms(),
        StaffAPI.getBookings(),
        StaffAPI.getInvoices(),
        StaffAPI.getServiceOrders()
      ]);

      var rooms    = results[0].data || [];
      var bookings = results[1].data || [];
      var invoices = results[2].data || [];
      var orders   = results[3].data || [];

      /* ── KPIs ── */
      var totalRooms    = rooms.length;
      var occupiedRooms = rooms.filter(function (r) { return r.status === 'occupied'; }).length;
      var occupancyRate = totalRooms > 0 ? pct(occupiedRooms, totalRooms) : 0;

      var revenue = invoices
        .filter(function (i) { return i.status === 'paid' || i.status === 'closed'; })
        .reduce(function (sum, i) { return sum + (Number(i.total_amount) || 0); }, 0);

      if (kpiOccupancy)    kpiOccupancy.textContent    = occupancyRate.toFixed(1) + '%';
      if (kpiRevenue)      kpiRevenue.textContent      = formatVND(revenue);
      if (kpiBookings)     kpiBookings.textContent     = String(bookings.length);
      if (kpiServices)     kpiServices.textContent     = String(orders.length);

      if (kpiOccupancySub) kpiOccupancySub.textContent = occupiedRooms + ' / ' + totalRooms + ' phòng đang có khách';
      if (kpiRevenueSub)   kpiRevenueSub.textContent   = invoices.filter(function (i) { return i.status === 'paid'; }).length + ' hóa đơn đã thu';
      if (kpiBookingsSub)  kpiBookingsSub.textContent  = 'Tổng đơn trong hệ thống';
      if (kpiServicesSub)  kpiServicesSub.textContent  = orders.filter(function (o) { return o.status === 'pending'; }).length + ' đơn chờ tiếp nhận';

      /* ── Chart 1: Booking Status ── */
      var bkStatuses = ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'pending'];
      var bkLabels   = ['Xác nhận', 'Đang ở', 'Trả phòng', 'Đã hủy', 'Chờ XN'];
      var bkCounts   = bkStatuses.map(function (s) {
        return bookings.filter(function (b) { return b.status === s; }).length;
      });
      var bkMax = Math.max.apply(null, bkCounts.concat([1]));
      var bkSegments = bkStatuses.map(function (s, i) {
        return { label: bkLabels[i], value: bkCounts[i], secondary: i > 2 };
      });
      renderBarChart(bookingStatusChart, bkSegments, bkMax);

      /* ── Chart 2: Room Status Donut ── */
      var rmSegments = [
        { label: 'Phòng trống',  value: rooms.filter(function (r) { return r.status === 'available'; }).length,    color: '#059669' },
        { label: 'Đang có khách', value: rooms.filter(function (r) { return r.status === 'occupied'; }).length,     color: '#2563eb' },
        { label: 'Cần dọn',      value: rooms.filter(function (r) { return r.status === 'dirty'; }).length,         color: '#d97706' },
        { label: 'Bảo trì',      value: rooms.filter(function (r) { return r.status === 'maintenance'; }).length,   color: '#dc2626' }
      ].filter(function (s) { return s.value > 0; });
      renderDonutChart(roomStatusChart, rmSegments);

      /* ── Detail Table ── */
      renderDetailTable(bookings);

      if (reportLastUpdate) {
        reportLastUpdate.textContent = 'Cập nhật lần cuối: ' + new Intl.DateTimeFormat('vi-VN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).format(new Date());
      }
    } catch (err) {
      if (reportErrorElem) {
        reportErrorElem.hidden = false;
        if (reportErrorMsgElem) reportErrorMsgElem.textContent = 'Lỗi: ' + (err.message || 'Không thể tải dữ liệu báo cáo.');
      }
    }
  }

  /* ── 10. Range Tabs ── */
  if (rangeTabsContainer) {
    rangeTabsContainer.addEventListener("click", function (e) {
      var btn = e.target.closest(".range-tab-btn");
      if (!btn) return;
      currentRange = btn.getAttribute("data-range") || 'today';
      rangeTabsContainer.querySelectorAll(".range-tab-btn").forEach(function (b) {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      // Hiện tại tất cả range đều dùng toàn bộ dữ liệu (chưa có API lọc theo ngày)
      showToast('Báo cáo hiển thị toàn bộ dữ liệu (API lọc theo kỳ chờ Backend hỗ trợ).', 'success');
      loadReportData();
    });
  }

  /* ── 11. Nút làm mới ── */
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Đang cập nhật...';
      loadReportData().finally(function () {
        refreshBtn.innerHTML = '<span aria-hidden="true">✓</span> Đã cập nhật';
        setTimeout(function () { refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Cập nhật báo cáo'; }, 1200);
      });
    });
  }

  /* ── Khởi động ── */
  updateModeUI();
  loadReportData();
});
