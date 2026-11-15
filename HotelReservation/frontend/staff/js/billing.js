/**
 * Hotel Reservation System - Billing & Invoices Module
 * File: HotelReservation/frontend/staff/js/billing.js
 * Author: Pham Quang Duy (Staff Frontend Lead)
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

  var invLoadingElem   = document.getElementById("inv-loading");
  var invErrorElem     = document.getElementById("inv-error");
  var invErrorMsgElem  = document.getElementById("inv-error-msg");

  var invTotalElem   = document.getElementById("inv-total");
  var invUnpaidElem  = document.getElementById("inv-unpaid");
  var invPaidElem    = document.getElementById("inv-paid");
  var invRevenueElem = document.getElementById("inv-revenue");

  var filterStatusElem = document.getElementById("inv-filter-status");
  var searchInputElem  = document.getElementById("inv-search");
  var tableBodyElem    = document.getElementById("inv-table-body");
  var emptyStateElem   = document.getElementById("empty-state");

  /* Side Panel */
  var invDetailPanel     = document.getElementById("inv-detail-panel");
  var invPanelTitle      = document.getElementById("inv-panel-title");
  var invPanelBody       = document.getElementById("inv-panel-body");
  var invPanelActions    = document.getElementById("inv-panel-actions");
  var closeInvPanelBtn   = document.getElementById("close-inv-panel");
  var invPanelBackdrop   = document.getElementById("inv-panel-backdrop");

  /* ── State ── */
  var allInvoicesCache   = [];
  var activeInvoice      = null;
  var toastTimerId       = null;

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
    modeToggleBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.toggleMockMode(); updateModeUI(); loadInvoices(); });
  }
  if (switchToApiBtnElem) {
    switchToApiBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.setMockMode(false); updateModeUI(); loadInvoices(); });
  }
  if (enableMockBtnElem) {
    enableMockBtnElem.addEventListener("click", function () { if (typeof StaffAPI === 'undefined') return; StaffAPI.setMockMode(true); updateModeUI(); loadInvoices(); });
  }
  if (retryBtnElem) retryBtnElem.addEventListener("click", function () { loadInvoices(); });
  window.addEventListener('staff:mode-change', function () { updateModeUI(); loadInvoices(); });

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
  function formatDateVN(isoStr) {
    if (!isoStr) return '—';
    var parts = String(isoStr).split('T')[0].split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
    return isoStr;
  }

  /* ── 6. Tải Hóa đơn ── */
  async function loadInvoices() {
    if (typeof StaffAPI === 'undefined') return;
    if (invLoadingElem) invLoadingElem.hidden = false;
    if (invErrorElem)   invErrorElem.hidden   = true;

    try {
      var res = await StaffAPI.getInvoices();
      allInvoicesCache = res.data || [];
      updateSummaryStats();
      renderTable();
      if (invLoadingElem) invLoadingElem.hidden = true;
    } catch (err) {
      if (invLoadingElem) invLoadingElem.hidden = true;
      if (invErrorElem) {
        invErrorElem.hidden = false;
        if (invErrorMsgElem) invErrorMsgElem.textContent = 'Lỗi: ' + (err.message || 'Không thể lấy hóa đơn.');
      }
    }
  }

  /* ── 7. Thống kê ── */
  function updateSummaryStats() {
    var totalCount  = allInvoicesCache.length;
    var unpaidCount = allInvoicesCache.filter(function (i) { return i.status === 'unpaid'; }).length;
    var paidCount   = allInvoicesCache.filter(function (i) { return i.status === 'paid' || i.status === 'closed'; }).length;
    var revenue     = allInvoicesCache
      .filter(function (i) { return i.status === 'paid' || i.status === 'closed'; })
      .reduce(function (sum, i) { return sum + (Number(i.total_amount) || 0); }, 0);

    if (invTotalElem)   invTotalElem.textContent   = String(totalCount);
    if (invUnpaidElem)  invUnpaidElem.textContent   = String(unpaidCount);
    if (invPaidElem)    invPaidElem.textContent     = String(paidCount);
    if (invRevenueElem) invRevenueElem.textContent  = formatVND(revenue);
  }

  /* ── 8. Render Bảng ── */
  function renderTable() {
    if (!tableBodyElem) return;

    var filterStatus = filterStatusElem ? filterStatusElem.value : 'all';
    var kw           = searchInputElem  ? searchInputElem.value.trim().toLowerCase() : '';

    var filtered = allInvoicesCache.filter(function (inv) {
      if (filterStatus !== 'all' && inv.status !== filterStatus) return false;
      if (kw) {
        var haystack = (String(inv.invoice_code || '') + ' ' +
          String(inv.booking_code || '') + ' ' +
          String(inv.guest_name || '')).toLowerCase();
        if (haystack.indexOf(kw) === -1) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tableBodyElem.innerHTML = '';
      if (emptyStateElem) emptyStateElem.hidden = false;
      return;
    }
    if (emptyStateElem) emptyStateElem.hidden = true;

    var html = '';
    filtered.forEach(function (inv) {
      var payBadgeClass = inv.status === 'paid'   ? 'paid'   :
                          inv.status === 'closed' ? 'closed' : 'unpaid';
      var payBadgeLabel = inv.status === 'paid'   ? 'Đã thanh toán' :
                          inv.status === 'closed' ? 'Đã đóng'       : 'Chờ thanh toán';

      var actionHtml = inv.status === 'unpaid'
        ? '<button class="button button-primary button-small inv-pay-btn" data-id="' + inv.id + '" type="button">Thu tiền</button>'
        : '<span style="font-size:11px; color:var(--text-secondary);">Đã xử lý</span>';

      html +=
        '<tr>' +
          '<td class="invoice-code">' + safeEscape(inv.invoice_code || ('#INV-' + inv.id)) + '</td>' +
          '<td>' + safeEscape(inv.booking_code || '—') + '</td>' +
          '<td><strong>' + safeEscape(inv.guest_name || '—') + '</strong></td>' +
          '<td style="text-align:right; font-weight:700;">' + formatVND(inv.total_amount) + '</td>' +
          '<td><span class="pay-badge ' + payBadgeClass + '">' + payBadgeLabel + '</span></td>' +
          '<td>' + safeEscape(formatDateVN(inv.issued_at)) + '</td>' +
          '<td style="text-align:right; display:flex; gap:6px; justify-content:flex-end;">' +
            '<button class="button button-outline button-small inv-view-btn" data-id="' + inv.id + '" type="button">Xem</button>' +
            actionHtml +
          '</td>' +
        '</tr>';
    });

    tableBodyElem.innerHTML = html;
    bindTableActions();
  }

  /* ── 9. Gán sự kiện bảng ── */
  function bindTableActions() {
    if (!tableBodyElem) return;

    tableBodyElem.querySelectorAll(".inv-view-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        openInvoicePanel(id);
      });
    });

    tableBodyElem.querySelectorAll(".inv-pay-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        openInvoicePanel(id, true);
      });
    });
  }

  /* ── 10. Mở Side Panel Chi Tiết Hóa Đơn ── */
  function openInvoicePanel(invoiceId, focusPayment) {
    activeInvoice = allInvoicesCache.find(function (i) { return String(i.id) === String(invoiceId); });
    if (!activeInvoice || !invDetailPanel) return;

    var inv = activeInvoice;
    if (invPanelTitle) invPanelTitle.textContent = inv.invoice_code || ('#INV-' + inv.id);

    var bodyHtml =
      '<div style="margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--color-border);">' +
        '<p style="margin:0 0 4px; font-size:11px; color:var(--text-secondary);">Khách hàng</p>' +
        '<strong style="font-size:15px;">' + safeEscape(inv.guest_name) + '</strong><br>' +
        '<span style="font-size:12px; color:var(--text-secondary);">Mã đặt phòng: ' + safeEscape(inv.booking_code || '—') + '</span>' +
      '</div>' +
      '<div class="inv-breakdown-row"><span>Tiền phòng:</span><strong>' + formatVND(inv.room_charges) + '</strong></div>' +
      '<div class="inv-breakdown-row"><span>Dịch vụ phòng (F&B / Minibar / Spa):</span><strong>' + formatVND(inv.service_charges) + '</strong></div>';

    if (Number(inv.late_checkout_fee) > 0) {
      bodyHtml += '<div class="inv-breakdown-row" style="color:#b91c1c;"><span>Phụ phí trả phòng trễ (BR-03):</span><strong>+' + formatVND(inv.late_checkout_fee) + '</strong></div>';
    }

    bodyHtml +=
      '<div class="inv-breakdown-row" style="color:#059669;"><span>Tiền cọc đã khấu trừ:</span><strong>-' + formatVND(inv.deposit_deducted) + '</strong></div>' +
      '<div class="inv-total-row"><span>TỔNG THANH TOÁN:</span><span>' + formatVND(inv.total_amount) + '</span></div>' +
      '<div style="margin-top:16px; font-size:12px; color:var(--text-secondary);">' +
        '<p style="margin:0 0 2px;">Phát hành: ' + safeEscape(formatDateVN(inv.issued_at)) + '</p>' +
        (inv.paid_at ? '<p style="margin:0;">Đã thanh toán: ' + safeEscape(formatDateVN(inv.paid_at)) + '</p>' : '') +
        (inv.payment_method ? '<p style="margin:4px 0 0;">Phương thức: ' + safeEscape(inv.payment_method) + '</p>' : '') +
      '</div>';

    if (invPanelBody) invPanelBody.innerHTML = bodyHtml;

    /* Nút hành động */
    var actionsHtml = '';
    if (inv.status === 'unpaid') {
      actionsHtml =
        '<select class="inv-payment-select" id="inv-pay-method">' +
          '<option value="cash">Tiền mặt</option>' +
          '<option value="card">Thẻ (POS)</option>' +
          '<option value="transfer">Chuyển khoản QR</option>' +
        '</select>' +
        '<button class="button button-primary" id="confirm-pay-btn" type="button" style="width:100%;">Xác nhận Thu tiền</button>' +
        '<button class="button button-outline" id="close-inv-panel-alt" type="button" style="width:100%;">Đóng lại</button>';
    } else {
      actionsHtml =
        '<p style="text-align:center; color:var(--text-secondary); font-size:12px; padding:8px 0;">Hóa đơn này đã được xử lý.</p>' +
        '<button class="button button-outline" id="close-inv-panel-alt" type="button" style="width:100%;">Đóng lại</button>';
    }
    if (invPanelActions) invPanelActions.innerHTML = actionsHtml;

    /* Gán sự kiện động */
    var confirmPayBtn = document.getElementById("confirm-pay-btn");
    if (confirmPayBtn) {
      confirmPayBtn.addEventListener("click", async function () {
        var method = document.getElementById("inv-pay-method");
        var payMethod = method ? method.value : 'cash';
        confirmPayBtn.disabled = true;
        confirmPayBtn.textContent = 'Đang xử lý...';

        try {
          await StaffAPI.payInvoice(activeInvoice.id, payMethod);
          showToast('Thanh toán hóa đơn ' + activeInvoice.invoice_code + ' thành công!', 'success');
          closePanelFn();
          loadInvoices();
        } catch (err) {
          showToast('Lỗi thanh toán: ' + (err.message || 'Thất bại'), 'error');
          confirmPayBtn.disabled = false;
          confirmPayBtn.textContent = 'Xác nhận Thu tiền';
        }
      });
    }

    var closeAlt = document.getElementById("close-inv-panel-alt");
    if (closeAlt) closeAlt.addEventListener("click", closePanelFn);

    invDetailPanel.classList.add("is-open");
    if (invPanelBackdrop) invPanelBackdrop.hidden = false;
  }

  function closePanelFn() {
    if (invDetailPanel) invDetailPanel.classList.remove("is-open");
    if (invPanelBackdrop) invPanelBackdrop.hidden = true;
    activeInvoice = null;
  }

  if (closeInvPanelBtn)  closeInvPanelBtn.addEventListener("click",  closePanelFn);
  if (invPanelBackdrop)  invPanelBackdrop.addEventListener("click",   closePanelFn);

  /* ── 11. Lọc & Tìm kiếm ── */
  if (filterStatusElem) filterStatusElem.addEventListener("change", renderTable);
  if (searchInputElem)  searchInputElem.addEventListener("input",  renderTable);

  /* ── 12. Nút làm mới ── */
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Đang tải...';
      loadInvoices().finally(function () {
        refreshBtn.innerHTML = '<span aria-hidden="true">✓</span> Đã cập nhật';
        setTimeout(function () { refreshBtn.innerHTML = '<span aria-hidden="true">↻</span> Tải lại danh sách'; }, 1200);
      });
    });
  }

  /* ── Khởi động ── */
  updateModeUI();
  loadInvoices();
});
