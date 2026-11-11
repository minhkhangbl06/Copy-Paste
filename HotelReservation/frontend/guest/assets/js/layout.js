"use strict";

(() => {
  const script = document.currentScript;
  if (!script || document.documentElement.dataset.layoutInitialized) return;
  document.documentElement.dataset.layoutInitialized = "true";

  // Resolve from this script, including when the site is hosted under a subpath.
  const siteRoot = new URL("../../", script.src);
  const homeUrl = new URL("index.html", siteRoot);
  const isHome = () => window.location.pathname === homeUrl.pathname || window.location.pathname === siteRoot.pathname;

  function resolveLinks(host) {
    host.querySelectorAll("a[data-site-path]").forEach(link => {
      link.href = new URL(link.dataset.sitePath, siteRoot).href;
    });
  }
  function updateActiveNavigation(header) {
    let label = header.dataset.activeNav;
    if (isHome()) label = "Trang chủ";
    else if (!label) {
      if (window.location.pathname === new URL("pages/rooms.html", siteRoot).pathname) label = "Loại phòng";
      if (window.location.pathname === new URL("pages/services.html", siteRoot).pathname) label = "Dịch vụ";
    }
    header.querySelectorAll(".nav-item").forEach(item => {
      if (item.dataset.label === label) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
  }
  function initializeMobileMenu(header) {
    if (header.dataset.menuInitialized) return;
    const button = header.querySelector(".menu-toggle");
    const navigation = header.querySelector("#main-navigation");
    if (!button || !navigation) return;
    header.dataset.menuInitialized = "true";
    const mobile = window.matchMedia("(max-width: 1100px)");

    function setOpen(open) {
      navigation.hidden = mobile.matches && !open;
      button.setAttribute("aria-expanded", String(mobile.matches && open));
    }
    function syncViewport() {
      const focusInMenu = navigation.contains(document.activeElement);
      const focusOnButton = document.activeElement === button;
      button.hidden = !mobile.matches;
      setOpen(false);
      if (mobile.matches && focusInMenu) button.focus({ preventScroll: true });
      else if (!mobile.matches && focusOnButton) navigation.querySelector("a[href]")?.focus({ preventScroll: true });
    }
    header.closeMobileMenu = () => setOpen(false);
    button.addEventListener("click", () => { header.closeAccount?.(); setOpen(button.getAttribute("aria-expanded") !== "true"); });
    navigation.addEventListener("click", event => {
      const link = event.target.closest("a[href]");
      if (!link || !navigation.contains(link)) return;
      const focusInMenu = navigation.contains(document.activeElement);
      setOpen(false);
      if (mobile.matches && focusInMenu) button.focus({ preventScroll: true });
      // Keep native link navigation, including new-tab/modifier-key behavior.
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !mobile.matches || button.getAttribute("aria-expanded") !== "true") return;
      event.preventDefault();
      const focusInMenu = navigation.contains(document.activeElement);
      setOpen(false);
      if (focusInMenu) button.focus({ preventScroll: true });
    });
    mobile.addEventListener("change", syncViewport);
    syncViewport();
  }
  function initializeAccount(header) {
    const session = window.GuestSession;
    if (!session || header.dataset.accountInitialized) return;
    header.dataset.accountInitialized = "true";
    const host = header.querySelector(".header-account"), actions = header.querySelector(".auth-actions"), notice = header.querySelector("#header-session-error"), inner = header.querySelector(".header-inner");
    let avatar = null, dropdown = null;
    function close(restore = false) { if (!dropdown) return; dropdown.hidden = true; avatar.setAttribute("aria-expanded", "false"); if (restore) avatar.focus({ preventScroll: true }); }
    header.closeAccount = () => close();
    function authLinks() { actions.querySelectorAll("a").forEach(a => { a.href = session.authURL(a.dataset.sitePath.includes("register") ? "register" : "login", window.location.href).href; }); }
    function logout() { const result = session.logout(); if (result.error) { const text = notice.querySelector("p") || document.createElement("p"); text.textContent = result.error; if (!text.parentNode) notice.prepend(text); notice.hidden = false; } }
    function render() {
      const state = session.load(); close(); host.replaceChildren(); avatar = null; dropdown = null;
      host.hidden = !state.guest; actions.hidden = Boolean(state.guest); inner.classList.toggle("session-active", Boolean(state.guest)); authLinks();
      notice.replaceChildren(); notice.hidden = !state.error;
      if (state.error) { const text = document.createElement("p"), retry = document.createElement("button"); text.textContent = "Chưa thể đọc hoặc kết thúc phiên đăng nhập. Vui lòng thử lại."; retry.type = "button"; retry.textContent = "Thử đăng xuất lại"; retry.className = "button button-outline"; retry.addEventListener("click", logout); notice.append(text, retry); }
      if (!state.guest) return;
      avatar = document.createElement("button"); avatar.type = "button"; avatar.className = "account-toggle"; avatar.id = "account-toggle"; avatar.setAttribute("aria-controls", "account-dropdown"); avatar.setAttribute("aria-expanded", "false"); avatar.setAttribute("aria-label", "Tài khoản của " + state.guest.fullName);
      const badge = document.createElement("span"), name = document.createElement("span"); badge.className = "account-avatar"; badge.setAttribute("aria-hidden", "true"); badge.textContent = session.initials(state.guest.fullName); name.className = "account-name"; name.textContent = state.guest.fullName.trim().split(/\s+/).slice(-2).join(" "); avatar.append(badge, name);
      dropdown = document.createElement("nav"); dropdown.id = "account-dropdown"; dropdown.className = "account-dropdown"; dropdown.hidden = true; dropdown.setAttribute("aria-label", "Tài khoản khách hàng");
      for (const [label, path] of [["Thông tin cá nhân", "pages/profile.html"], ["Booking của tôi", "pages/my-bookings.html"], ["Lịch sử dịch vụ", "pages/service-history.html"]]) { const a = document.createElement("a"); a.href = new URL(path, siteRoot).href; a.textContent = label; dropdown.append(a); }
      const out = document.createElement("button"); out.type = "button"; out.textContent = "Đăng xuất"; out.addEventListener("click", logout); dropdown.append(out); host.append(avatar, dropdown);
      function open() { header.closeMobileMenu?.(); dropdown.hidden = false; avatar.setAttribute("aria-expanded", "true"); }
      avatar.addEventListener("click", () => dropdown.hidden ? open() : close());
      avatar.addEventListener("keydown", event => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(); const items = dropdown.querySelectorAll("a, button"); items[event.key === "ArrowDown" ? 0 : items.length - 1].focus(); } });
      dropdown.addEventListener("click", event => { if (event.target.closest("a")) close(); });
    }
    document.addEventListener("pointerdown", event => { if (!host.contains(event.target)) close(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && dropdown && !dropdown.hidden) { event.preventDefault(); close(true); } });
    actions.addEventListener("pointerdown", authLinks); actions.addEventListener("focusin", authLinks); actions.addEventListener("click", authLinks);
    window.addEventListener("copyPasteHotel:sessionchange", render); window.addEventListener("pageshow", render); window.addEventListener("popstate", render); window.addEventListener("hashchange", authLinks);
    render();
  }
  async function loadFragment(name) {
    const host = document.querySelector(`[data-layout="${name}"]`);
    if (!host) return;
    const url = new URL(`components/${name}.html`, siteRoot);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      host.innerHTML = await response.text();
      resolveLinks(host);
      if (name === "header") {
        updateActiveNavigation(host);
        initializeMobileMenu(host);
        initializeAccount(host);
      }
    } catch (error) {
      console.error(
        `[layout] Không thể tải ${name}: ${url.href}. Hãy chạy trang qua Live Server/HTTP.`,
        error,
      );
      host.hidden = true;
    }
  }

  Promise.allSettled([loadFragment("header"), loadFragment("footer")]);
})();
