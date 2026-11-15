/**
 * Hotel Reservation System - Housekeeping Board Module
 * File: HotelReservation/frontend/staff/js/housekeeping.js
 * Author: Pham Quang Duy (Staff Frontend Lead)
 *
 * Chức năng:
 * - Hiển thị toàn bộ phòng dạng Card Grid phân loại theo trạng thái.
 * - Nhân viên Housekeeping có thể cập nhật trạng thái phòng ngay trên thẻ:
 *     Dirty  → Available (Đã dọn sạch)
 *     Available → Dirty  (Đánh dấu cần dọn)
 *     Bất kỳ → Maintenance (Báo bảo trì)
 *     Maintenance → Available (Hoàn tất bảo trì)
 * - Lọc theo trạng thái và từ khóa tìm kiếm.
 */

document.addEventListener("DOMContentLoaded", function () {
  'use strict';

  /* ── DOM References ── */
  var sidebarElem        = document.getElementById("sidebar");
  var menuToggleBtn      = document.getElementById("menu-toggle");
  var backdropElem       = document.getElementById("sidebar-backdrop");
  var todayLabelElem     = document.getElementById("today-label");
  var refreshBtn         = document.getElementById("refresh-btn");
  var toastElem          = document.getElementById("toast");

  var modeBadgeElem          = document.getElementById("mode-badge");
  var modeToggleBtnElem      = document.getElementById("mode-toggle-btn");
  var modeNoticeBannerElem   = document.getElementById("mode-notice-banner");
  var switchToApiBtnElem     = document.getElementById("switch-to-api-btn");
  var enableMockBtnElem      = document.getElementById("enable-mock-btn");
  var retryBtnElem           = document.getElementById("retry-btn");

  var hkLoadingElem    = document.getElementById("hk-loading");
  var hkErrorElem      = document.getElementById("hk-error");
  var hkErrorMsgElem   = document.getElementById("hk-error-msg");

  var statAvailableElem   = document.getElementById("hk-stat-available");
  var statDirtyElem       = document.getElementById("hk-stat-dirty");
  var statOccupiedElem    = document.getElementById("hk-stat-occupied");
  var statMaintenanceElem = document.getElementById("hk-stat-maintenance");

  var filterStatusElem = document.getElementById("hk-filter-status");
  var searchInputElem  = document.getElementById("hk-search");
  var roomBoardGrid    = document.getElementById("room-board-grid");
  var emptyStateElem   = document.getElementById("empty-state");
  var roomCountElem    = document.getElementById("hk-room-count");

  /* ── State ── */
  var allRoomsCache = [];
  var toastTimerId  = null;

  /* ── 1. Ngày hiện tại ── */
  if (todayLabelElem) {
    try {
      todayLabelElem.textContent = new Intl.DateTimeFormat("vi-VN", {
        weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
      }).format(new Date());
    } catch (e) {
      todayLabelElem.textContent = new Date().toLocaleDateString("vi-VN");
    }
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

  /* ── 3. Mode Badge ── */
  function updateModeUI() {
    if (typeof StaffAPI === 'undefined') return;
    var info = StaffAPI.getModeInfo();
    if (modeBadgeElem) {
      modeBadgeElem.textContent  = info.badgeText;
      modeBadgeElem.className    = "mode-badge " + info.badgeClass;
    }
    if (modeNoticeBannerElem) modeNoticeBannerElem.hidden = !info.isMock;
  }

  if (modeToggleBtnElem) {
    modeToggleBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      StaffAPI.toggleMockMode(); updateModeUI(); loadRooms();
    });
  }
  if (switchToApiBtnElem) {
    switchToApiBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      StaffAPI.setMockMode(false); updateModeUI(); loadRooms();
    });
  }
  if (enableMockBtnElem) {
    enableMockBtnElem.addEventListener("click", function () {
      if (typeof StaffAPI === 'undefined') return;
      StaffAPI.setMockMode(true); updateModeUI(); loadRooms();
    });
  }
  if (retryBtnElem) retryBtnElem.addEventListener("click", function () { loadRooms(); });
  window.addEventListener('staff:mode-change', function () { updateModeUI(); loadRooms(); });

  /* ── 4. Toast ── */
  function showToast(message, type) {
    if (!toastElem) return;
    clearTimeout(toastTimerId);
    toastElem.textContent = message;
    toastElem.className   = "toast show " + (type === "error" ? "toast-error" : "toast-success");
    toastElem.hidden      = false;
    toastTimerId = setTimeout(function () {
      toastElem.classList.remove("show");
      toastElem.hidden = true;
    }, 3200);
  }

  /* ── 5. Helpers ── */
  function safeEscape(str) {
    if (str == null) return '';
    return String(str).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
  }

  var STATUS_META = {
    available:   { label: 'Trống – sạch', cls: 'is-available', dot: '●', dotColor: '#059669' },
    dirty:       { label: 'Cần dọn dẹp',  cls: 'is-dirty',     dot: '●', dotColor: '#d97706' },
    occupied:    { label: 'Đang có khách', cls: 'is-occupied',  dot: '●', dotColor: '#2563eb' },
    maintenance: { label: 'Bảo trì',       cls: 'is-maintenance', dot: '●', dotColor: '#dc2626' }
  };

  function getStatusMeta(status) {
    return STATUS_META[status] || { label: status, cls: '', dot: '●', dotColor: '#94a3b8' };
  }

  /* ── 6. Tải dữ liệu phòng ── */
  async function loadRooms() {
    if (typeof StaffAPI === 'undefined') return;
    if (hkLoadingElem) hkLoadingElem.hidden = false;
    if (hkErrorElem)   hkErrorElem.hidden   = true;
    if (roomBoardGrid) roomBoardGrid.innerHTML = '';
    if (emptyStateElem) emptyStateElem.hidden  = true;

    try {
      var res = await StaffAPI.getRooms();
      allRoomsCache = res.data || [];
      updateStats();
      renderBoard();
      if (hkLoadingElem) hkLoadingElem.hidden = true;
    } catch (err) {
      if (hkLoadingElem) hkLoadingElem.hidden = true;
      if (hkErrorElem) {
        hkErrorElem.hidden = false;
        if (hkErrorMsgElem) hkErrorMsgElem.textContent = 'Lỗi: ' + (err.message || 'Không thể lấy danh sách phòng.');
      }
    }
  }

  /* ── 7. Thống kê ── */
  function updateStats() {
    var counts = { available: 0, dirty: 0, occupied: 0, maintenance: 0 };
    allRoomsCache.forEach(function (r) {
      if (counts[r.status] !== undefined) counts[r.status]++;
    });
    if (statAvailableElem)   statAvailableElem.textContent   = String(counts.available);
    if (statDirtyElem)       statDirtyElem.textContent       = String(counts.dirty);
    if (statOccupiedElem)    statOccupiedElem.textContent    = String(counts.occupied);
    if (statMaintenanceElem) statMaintenanceElem.textContent = String(counts.maintenance);
  }

  /* ── 8. Render Board ── */
  function renderBoard() {
    if (!roomBoardGrid) return;

    var filterStatus = filterStatusElem ? filterStatusElem.value : 'all';
    var kw           = searchInputElem  ? searchInputElem.value.trim().toLowerCase() : '';

    var filtered = allRoomsCache.filter(function (r) {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (kw) {
        var haystack = (String(r.room_number || '') + ' ' + String(r.room_type || '')).toLowerCase();
        if (haystack.indexOf(kw) === -1) return false;
      }
      return true;
    });

    if (roomCountElem) {
      roomCountElem.textContent = 'Hiển thị ' + filtered.length + ' / ' + allRoomsCache.length + ' phòng';
    }

    if (filtered.length === 0) {
      roomBoardGrid.innerHTML = '';
      if (emptyStateElem) emptyStateElem.hidden = false;
      return;
    }
    if (emptyStateElem) emptyStateElem.hidden = true;

    var html = '';
    filtered.forEach(function (room) {
      var meta = getStatusMeta(room.status);
      var priceStr = room.price_per_night
        ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(room.price_per_night) + '/đêm'
        : '—';

      /* Các nút hành động tùy trạng thái */
      var actionBtns = '';
      if (room.status === 'dirty') {
        actionBtns =
          '<button class="btn-hk-action btn-clean-done hk-status-action" data-id="' + room.id + '" data-to="available" type="button">✓ Đã dọn sạch</button>' +
          '<button class="btn-hk-action btn-mark-maint hk-status-action" data-id="' + room.id + '" data-to="maintenance" type="button">Báo bảo trì</button>';
      } else if (room.status === 'available') {
        actionBtns =
          '<button class="btn-hk-action btn-mark-dirty hk-status-action" data-id="' + room.id + '" data-to="dirty" type="button">Đánh dấu cần dọn</button>' +
          '<button class="btn-hk-action btn-mark-maint hk-status-action" data-id="' + room.id + '" data-to="maintenance" type="button">Báo bảo trì</button>';
      } else if (room.status === 'maintenance') {
        actionBtns =
          '<button class="btn-hk-action btn-clean-done hk-status-action" data-id="' + room.id + '" data-to="available" type="button">✓ Hoàn tất bảo trì</button>';
      } else if (room.status === 'occupied') {
        actionBtns = '<span style="font-size:11px; color:var(--text-secondary);">Đang có khách. Chờ Check-out.</span>';
      }

      html +=
        '<div class="hk-room-card ' + meta.cls + '" data-room-id="' + room.id + '">' +
          '<div class="hk-room-header">' +
            '<div>' +
              '<div class="hk-room-number">P. ' + safeEscape(room.room_number) + '</div>' +
              '<div class="hk-room-type">' + safeEscape(room.room_type || '') + '</div>' +
            '</div>' +
            '<span style="font-size: 11px; font-weight:700; color:' + meta.dotColor + ';">' + safeEscape(meta.label) + '</span>' +
          '</div>' +
          '<div class="hk-room-body">' +
            '<div class="hk-room-meta">' +
              '<div class="hk-meta-row"><span>Giá niêm yết:</span><strong>' + priceStr + '</strong></div>' +
              '<div class="hk-meta-row"><span>Sức chứa tối đa:</span><strong>' + (room.capacity || '—') + ' khách</strong></div>' +
            '</div>' +
          '</div>' +
          '<div class="hk-room-actions">' + actionBtns + '</div>' +
        '</div>';
    });

    roomBoardGrid.innerHTML = html;
    bindBoardActions();
  }

  /* ── 9. Gán sự kiện nút hành động trên Card ── */
  function bindBoardActions() {
    if (!roomBoardGrid) return;
    var btns = roomBoardGrid.querySelectorAll(".hk-status-action");
    btns.forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var roomId   = btn.getAttribute("data-id");
        var newStatus = btn.getAttribute("data-to");
        if (!roomId || !newStatus || typeof StaffAPI === 'undefined') return;

        btn.disabled = true;
        var origText = btn.textContent;
        btn.textContent = 'Đang cập nhật...';

        try {
          await StaffAPI.updateRoomStatus(roomId, newStatus);

          /* Cập nhật cache cục bộ ngay lập tức (Optimistic UI) */
          var idx = allRoomsCache.findIndex(function (r) { return String(r.id) === String(roomId); });
          if (idx !== -1) allRoomsCache[idx].status = newStatus;

          var statusLabels = { available: 'Trống – sạch', dirty: 'Cần dọn', occupied: 'Đang có khách', maintenance: 'Bảo trì' };
          showToast('Phòng ' + (allRoomsCache[idx] ? allRoomsCache[idx].room_number : roomId) +
            ' → ' + (statusLabels[newStatus] || newStatus) + ' thành công.', 'success');
          updateStats();
          renderBoard();
        } catch (err) {
          showToast('Lỗi cập nhật phòng: ' + (err.message || 'Thất bại.'), 'error');
          btn.disabled = false;
          btn.textContent = origText;
        }
      });
    });
  }

  /* ── 10. Lọc & Tìm kiếm ── */
  if (filterStatusElem) filterStatusElem.addEventListener("change", renderBoard);
  if (searchInputElem)  searchInputElem.addEventListener("input",  renderBoard);

  /* ── 11. Nút làm mới ── */
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Đang tải...';
      loadRooms().finally(function () {
        refreshBtn.innerHTML = '<span aria-hidden="true">✓</span> Đã cập nhật';
        setTimeout(function () {
          refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Tải lại bảng phòng';
        }, 1200);
      });
    });
  }

  /* ── Khởi động ── */
  updateModeUI();
  loadRooms();
});
