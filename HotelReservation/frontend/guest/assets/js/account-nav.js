"use strict";
(() => {
  const host = document.querySelector("[data-account-nav]"), session = window.GuestSession;
  if (!host || !session || host.dataset.initialized) return;
  host.dataset.initialized = "true";
  const make = (tag, text, cls) => { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; };
  const identity = make("div", "", "profile-identity"), avatar = make("span", "", "profile-avatar");
  avatar.setAttribute("aria-hidden", "true");
  const details = make("div", "", "profile-identity-text"), name = make("h2"), role = make("p", "Khách hàng");
  details.append(name, role); identity.append(avatar, details);
  const nav = make("nav", "", "profile-menu"); nav.setAttribute("aria-label", "Menu tài khoản");
  for (const [key, label, page] of [["profile", "Thông tin cá nhân", "profile.html"], ["bookings", "Booking của tôi", "my-bookings.html"], ["history", "Lịch sử dịch vụ", "service-history.html"]]) {
    const link = make("a", label, "profile-menu-item"); link.href = new URL("pages/" + page, session.root).href;
    if (host.dataset.accountNav === key) link.setAttribute("aria-current", "page");
    nav.append(link);
  }
  const login = make("a", "Đăng nhập", "profile-menu-item"); login.href = session.authURL("login", location.href).href;
  const logoutArea = make("div", "", "profile-menu-logout"), logout = make("button", "Đăng xuất", "profile-menu-item");
  logout.type = "button";
  // Profile keeps its existing logout listener; the other account pages use
  // the same GuestSession adapter, without a second session/profile store.
  if (host.dataset.accountNav === "profile") logout.dataset.profileLogout = "";
  else logout.addEventListener("click", () => { const result = session.logout(); if (result.error) { error.textContent = result.error; error.hidden = false; } });
  logoutArea.append(logout); nav.append(login, logoutArea);
  const error = make("p", "", "account-nav-error"); error.setAttribute("role", "status"); error.hidden = true;
  host.replaceChildren(identity, nav, error);
  function render() {
    const state = session.load(); identity.hidden = !state.guest; login.hidden = Boolean(state.guest); logoutArea.hidden = !state.guest;
    name.textContent = state.guest?.fullName || ""; avatar.textContent = state.guest ? session.initials(state.guest.fullName) : "";
    login.href = session.authURL("login", location.href).href;
    if (state.error) { error.textContent = "Chưa thể đọc thông tin tài khoản. Vui lòng thử lại."; error.hidden = false; }
    else { error.textContent = ""; error.hidden = true; }
  }
  window.addEventListener("copyPasteHotel:sessionchange", render); window.addEventListener("pageshow", render); render();
})();