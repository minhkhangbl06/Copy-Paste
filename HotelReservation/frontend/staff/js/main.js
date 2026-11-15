/**
 * Hotel Reservation System - Staff Dashboard Module
 * File: HotelReservation/frontend/staff/js/main.js
 * Author: Pham Quang Duy (Staff Frontend Lead)
 *
 * Chức năng:
 * - Hiển thị tổng quan các chỉ số phòng và đặt phòng theo thời gian thực.
 * - Hiển thị công suất sử dụng phòng (occupancy rate).
 * - Kết nối trực tiếp StaffAPI.getDashboardSummary() với Backend Laravel.
 * - Hỗ trợ Mock Mode chủ động có chỉ dẫn rõ ràng.
 * - Xử lý tìm kiếm nhanh trên bảng đặt phòng gần đây.
 */

document.addEventListener("DOMContentLoaded", function () {
  'use strict';

  // Các phần tử DOM giao diện
  var sidebarElem = document.getElementById("sidebar");
  var menuToggleBtn = document.getElementById("menu-toggle");
  var backdropElem = document.getElementById("sidebar-backdrop");
  var todayLabelElem = document.getElementById("today-label");
  var refreshBtn = document.getElementById("refresh-button");

  // Mode badge & controls
  var modeBadgeElem = document.getElementById("mode-badge");
  var modeToggleBtnElem = document.getElementById("mode-toggle-btn");
  var modeNoticeBannerElem = document.getElementById("mode-notice-banner");
  var switchToApiBtnElem = document.getElementById("switch-to-api-btn");

  // Error & loading states
  var dashboardLoadingElem = document.getElementById("dashboard-loading");
  var dashboardErrorElem = document.getElementById("dashboard-error");
  var dashboardErrorMsgElem = document.getElementById("dashboard-error-msg");
  var retryDashboardBtnElem = document.getElementById("retry-dashboard-btn");
  var enableMockBtnElem = document.getElementById("enable-mock-btn");

  // Stat values
  var statTotalRoomsElem = document.getElementById("stat-total-rooms");
  var statAvailableRoomsElem = document.getElementById("stat-available-rooms");
  var statOccupiedRoomsElem = document.getElementById("stat-occupied-rooms");
  var statPendingBookingsElem = document.getElementById("stat-pending-bookings");

  // Occupancy elements
  var occupancyRateTextElem = document.getElementById("occupancy-rate-text");
  var occupancyBarFillElem = document.getElementById("occupancy-bar-fill");
  var legendAvailableElem = document.getElementById("legend-available");
  var legendOccupiedElem = document.getElementById("legend-occupied");
  var legendMaintenanceElem = document.getElementById("legend-maintenance");
  var occupancyDataSourceElem = document.getElementById("occupancy-data-source");

  // Recent bookings table
  var searchInputElem = document.getElementById("booking-search");
  var tableBodyElem = document.getElementById("booking-table-body");
  var emptyStateElem = document.getElementById("empty-state");
  var tableFooterStatusElem = document.getElementById("table-footer-status");

  // Dữ liệu bộ nhớ tạm
  var currentRecentBookings = [];

  // 1. Cập nhật nhãn ngày hôm nay (tiếng Việt)
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

  // 2. Xử lý Sidebar Mobile
  function setSidebarState(isOpen) {
    if (sidebarElem) sidebarElem.classList.toggle("is-open", isOpen);
    if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", String(isOpen));
    if (backdropElem) backdropElem.hidden = !isOpen;
    document.body.classList.toggle("menu-open", isOpen);
  }

  if (menuToggleBtn) {
    menuToggleBtn.addEventListener("click", function () {
      var isOpen = menuToggleBtn.getAttribute("aria-expanded") !== "true";
      setSidebarState(isOpen);
    });
  }

  if (backdropElem) {
    backdropElem.addEventListener("click", function () {
      setSidebarState(false);
    });
  }

  // 3. Quản lý Chế độ API / Mock Mode
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

    if (occupancyDataSourceElem) {
      occupancyDataSourceElem.textContent = info.isMock
        ? "Dữ liệu mô phỏng trong LocalStorage (Mock Mode)"
        : "Kết nối trực tiếp máy chủ Backend Laravel";
    }
  }

  if (modeToggleBtnElem) {
    modeToggleBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      var newMode = StaffAPI.toggleMockMode();
      updateModeUI();
      loadDashboardData();
    });
  }

  if (switchToApiBtnElem) {
    switchToApiBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      StaffAPI.setMockMode(false);
      updateModeUI();
      loadDashboardData();
    });
  }

  if (enableMockBtnElem) {
    enableMockBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      StaffAPI.setMockMode(true);
      updateModeUI();
      loadDashboardData();
    });
  }

  if (retryDashboardBtnElem) {
    retryDashboardBtnElem.addEventListener("click", function () {
      loadDashboardData();
    });
  }

  window.addEventListener('staff:mode-change', function () {
    updateModeUI();
    loadDashboardData();
  });

  // 4. Các hàm tiện ích định dạng
  function formatVND(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0);
  }

  function formatDateVN(dateStr) {
    if (!dateStr) return '—';
    var parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return dateStr;
  }

  function getStatusLabelAndClass(status) {
    switch (status) {
      case 'confirmed':
        return { label: 'Đã xác nhận', cls: 'status-confirmed' };
      case 'checked_in':
        return { label: 'Đang lưu trú', cls: 'status-checked' };
      case 'checked_out':
        return { label: 'Đã trả phòng', cls: 'status-checked' };
      case 'cancelled':
        return { label: 'Đã hủy', cls: 'status-cancelled' };
      case 'pending':
      default:
        return { label: 'Chờ xác nhận', cls: 'status-pending' };
    }
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

  // 5. Hiển thị danh sách Đặt phòng gần đây
  function renderRecentBookingsTable(bookings) {
    currentRecentBookings = bookings || [];
    if (!tableBodyElem) return;

    if (currentRecentBookings.length === 0) {
      tableBodyElem.innerHTML = '';
      if (emptyStateElem) {
        emptyStateElem.hidden = false;
        emptyStateElem.textContent = 'Chưa có đơn đặt phòng nào trong hệ thống.';
      }
      return;
    }

    if (emptyStateElem) emptyStateElem.hidden = true;

    var rowsHtml = '';
    for (var i = 0; i < currentRecentBookings.length; i++) {
      var item = currentRecentBookings[i];
      var roomDisplay = item.room
        ? (item.room.room_type + ' ' + (item.room.room_number ? '#' + item.room.room_number : ''))
        : ('Phòng #' + (item.room_id || '—'));
      var statusInfo = getStatusLabelAndClass(item.status);

      rowsHtml += '<tr>' +
        '<td class="booking-code">' + safeEscape(item.booking_code || ('#BK-' + item.id)) + '</td>' +
        '<td><strong>' + safeEscape(item.guest_name || 'Khách vãng lai') + '</strong><br><small style="color:var(--text-secondary);">' + safeEscape(item.guest_phone || '') + '</small></td>' +
        '<td>' + safeEscape(roomDisplay) + '</td>' +
        '<td>' + safeEscape(formatDateVN(item.check_in_date)) + '</td>' +
        '<td>' + safeEscape(formatDateVN(item.check_out_date)) + '</td>' +
        '<td><span class="status ' + statusInfo.cls + '">' + safeEscape(statusInfo.label) + '</span></td>' +
        '</tr>';
    }

    tableBodyElem.innerHTML = rowsHtml;
  }

  // 6. Tải dữ liệu Dashboard từ StaffAPI
  async function loadDashboardData() {
    if (typeof StaffAPI === 'undefined') return;

    if (dashboardLoadingElem) dashboardLoadingElem.hidden = false;
    if (dashboardErrorElem) dashboardErrorElem.hidden = true;

    try {
      var response = await StaffAPI.getDashboardSummary();
      var data = response.data || {};

      // Cập nhật 4 chỉ số thống kê
      if (statTotalRoomsElem) statTotalRoomsElem.textContent = data.total_rooms != null ? data.total_rooms : '—';
      if (statAvailableRoomsElem) statAvailableRoomsElem.textContent = data.available_rooms != null ? data.available_rooms : '—';
      if (statOccupiedRoomsElem) statOccupiedRoomsElem.textContent = data.occupied_rooms != null ? data.occupied_rooms : '—';
      if (statPendingBookingsElem) statPendingBookingsElem.textContent = data.pending_bookings != null ? data.pending_bookings : '0';

      // Cập nhật công suất phòng
      var rate = Number(data.occupancy_rate) || 0;
      if (occupancyRateTextElem) occupancyRateTextElem.textContent = rate.toFixed(1) + '%';
      if (occupancyBarFillElem) occupancyBarFillElem.style.width = Math.min(100, Math.max(0, rate)) + '%';

      if (legendAvailableElem) legendAvailableElem.textContent = data.available_rooms != null ? data.available_rooms : '—';
      if (legendOccupiedElem) legendOccupiedElem.textContent = data.occupied_rooms != null ? data.occupied_rooms : '—';
      if (legendMaintenanceElem) legendMaintenanceElem.textContent = data.maintenance_rooms != null ? data.maintenance_rooms : '—';

      // Render danh sách gần đây
      renderRecentBookingsTable(data.recent_bookings || []);

      if (tableFooterStatusElem) {
        tableFooterStatusElem.textContent = response.isMock
          ? 'Đang hiển thị 5 đơn gần nhất (Mock Mode)'
          : 'Dữ liệu được cập nhật từ máy chủ';
      }

      if (dashboardLoadingElem) dashboardLoadingElem.hidden = true;
    } catch (err) {
      if (dashboardLoadingElem) dashboardLoadingElem.hidden = true;
      if (dashboardErrorElem) {
        dashboardErrorElem.hidden = false;
        if (dashboardErrorMsgElem) {
          dashboardErrorMsgElem.textContent = 'Lỗi kết nối API Backend: ' + (err.message || 'Không thể truy cập máy chủ.');
        }
      }
    }
  }

  // 7. Lọc bảng tìm kiếm nhanh
  if (searchInputElem) {
    searchInputElem.addEventListener("input", function () {
      var keyword = searchInputElem.value.trim().toLocaleLowerCase("vi");
      var rows = tableBodyElem ? Array.from(tableBodyElem.querySelectorAll("tr")) : [];
      var visibleCount = 0;

      rows.forEach(function (row) {
        var matches = row.textContent.toLocaleLowerCase("vi").indexOf(keyword) !== -1;
        row.hidden = !matches;
        if (matches) visibleCount += 1;
      });

      if (emptyStateElem) {
        emptyStateElem.hidden = visibleCount !== 0;
        if (visibleCount === 0) {
          emptyStateElem.textContent = 'Không tìm thấy đặt phòng phù hợp với từ khóa "' + searchInputElem.value + '".';
        }
      }
    });
  }

  // 8. Nút làm mới
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Đang tải...';
      loadDashboardData().finally(function () {
        refreshBtn.innerHTML = '<span aria-hidden="true">✓</span> Đã cập nhật';
        setTimeout(function () {
          refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Làm mới dữ liệu';
        }, 1200);
      });
    });
  }

  // Khởi động
  updateModeUI();
  loadDashboardData();
});
