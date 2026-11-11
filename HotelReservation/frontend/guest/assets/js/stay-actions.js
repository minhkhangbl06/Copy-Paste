"use strict";
(() => {
  const body = document.body, main = document.querySelector("main");
  if (!main || body.dataset.stayActionsInitialized) return;
  body.dataset.stayActionsInitialized = "true";
  body.classList.add("stay-actions-page");
  const header = document.getElementById("site-header"), footer = document.getElementById("site-footer");
  const menu = body.dataset.foodView === "menu";
  const room = document.querySelector(".room-detail-stay");
  const booking = document.querySelector(".booking-summary");
  const summary = room || booking || document.querySelector(".food-summary");
  const original = menu ? document.querySelector(".food-cart-bar a") :
    document.querySelector(".room-detail-book, .booking-confirm, #food-submit");
  if (!original) return;
  const breakpoint = window.matchMedia(body.dataset.foodView === "cart" ? "(max-width: 1100px)" : "(max-width: 900px)");
  if (summary) summary.classList.add("stay-summary-sticky");
  const dock = menu ? document.querySelector(".food-cart-bar") : document.createElement("section");
  dock.classList.add("stay-dock");
  let label, amount, action;
  if (!menu) {
    dock.setAttribute("aria-label", "Tóm tắt và thao tác");
    dock.hidden = true;
    const copy = document.createElement("div"); copy.className = "stay-dock-copy";
    label = document.createElement("p"); label.className = "stay-dock-label";
    amount = document.createElement("p"); amount.className = "stay-dock-amount";
    action = document.createElement("button"); action.type = original.form ? "submit" : "button"; action.className = original.className;
    if (original.form) action.setAttribute("form", original.form.id);
    // Exactly the original action: validation, storage, busy guards and
    // navigation remain owned by each page, without copied inputs.
    action.addEventListener("click", event => {
      if (original.disabled || !visible(original)) { event.preventDefault(); return; }
      if (!original.form) original.click();
    });
    copy.append(label, amount); dock.append(copy, action); main.append(dock);
  }
  const spacer = document.createElement("div"); spacer.className = "stay-dock-spacer";
  spacer.setAttribute("aria-hidden", "true"); main.append(spacer);
  let pending = false, footerVisible = false;
  const visible = element => Boolean(element && !element.closest("[hidden]") && element.getClientRects().length);
  const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  const setStyle = (name, value) => { if (body.style.getPropertyValue(name) !== value) body.style.setProperty(name, value); };
  const editing = () => {
    const el = document.activeElement;
    return el && el.matches("textarea, select, input:not([type=radio]):not([type=checkbox]):not([type=button]):not([type=submit])");
  };
  function update() {
    pending = false;
    const bottom = header && !header.hidden ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    setStyle("--stay-header-bottom", Math.ceil(bottom) + "px");
    if (summary) {
      // Tall summaries (including expanded validation) stay in normal flow.
      summary.classList.toggle("stay-summary-tall", summary.offsetHeight + bottom + 32 > window.innerHeight);
    }
    if (!menu) {
      const hide = !(breakpoint.matches && visible(summary) && visible(original));
      if (dock.hidden !== hide) dock.hidden = hide;
      const estimate = room && document.getElementById("room-detail-estimate");
      const total = room ? estimate?.querySelector('[data-estimate="amount"]') :
        document.querySelector(booking ? "#booking-total" : ".food-summary-total dd");
      const hasQuote = !room || (estimate && !estimate.hidden);
      setText(label, hasQuote ? (booking || room ? "Tiền phòng tạm tính" : "Tổng tạm tính") : "Giá/đêm");
      setText(amount, (hasQuote ? total : document.querySelector(".room-detail-price"))?.textContent.trim() || "");
      setText(action, original.textContent.trim());
      if (action.disabled !== original.disabled) action.disabled = original.disabled;
      action.setAttribute("aria-disabled", String(original.disabled));
    }
    const active = !dock.hidden;
    const footerRect = footer?.getBoundingClientRect();
    footerVisible = Boolean(footerRect && footerRect.height && footerRect.top < window.innerHeight && footerRect.bottom > 0);
    const vv = window.visualViewport;
    const keyboard = breakpoint.matches && (editing() || (vv && window.innerHeight - vv.height > 150));
    const overlay = document.querySelector("dialog[open]") || header?.querySelector('[aria-expanded="true"]');
    const suppressed = active && Boolean(footerVisible || keyboard || overlay);
    dock.classList.toggle("stay-dock-suppressed", suppressed);
    dock.inert = suppressed;
    setStyle("--stay-dock-height", (active ? Math.ceil(dock.getBoundingClientRect().height) : 0) + "px");
    body.classList.toggle("stay-has-dock", active);
  }
  // Flush UI state in the same event turn, including disabled buttons and menus.
  function schedule() { if (!pending) { pending = true; queueMicrotask(update); } }
  const resize = new ResizeObserver(schedule);
  [header, summary, dock].filter(Boolean).forEach(el => resize.observe(el));
  const mutations = new MutationObserver(schedule);
  [main, header].filter(Boolean).forEach(el => mutations.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "disabled", "aria-expanded", "open"] }));
  if (footer) new IntersectionObserver(entries => { footerVisible = entries[0].isIntersecting; schedule(); }).observe(footer);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("pageshow", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  breakpoint.addEventListener("change", schedule);
  update();
})();
