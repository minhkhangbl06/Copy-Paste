"use strict";
(() => {
  const root = new URL("../../", document.currentScript.src), home = new URL("index.html", root);
  const key = "copyPasteHotel.guestSession", version = 2;
  const privateKeys = ["bookingDraft", "simulatedBookings", "bookingUpdates", "foodCarts", "serviceRequests", "invoices", "reviews", "guestWorkspace", "bookingReceipts"].map(name => "copyPasteHotel." + name);
  const pages = ["index.html", ...["rooms", "room-detail", "booking", "booking-payment", "my-bookings", "booking-detail", "services", "food-menu", "food-cart", "invoice", "profile", "service-history", "review"].map(name => "pages/" + name + ".html")];
  function safeReturn(value) {
    try {
      const url = new URL(value || home.href, root);
      if (url.origin !== root.origin || url.username || url.password || !pages.some(page => new URL(page, root).pathname === url.pathname)) return new URL(home);
      for (const name of [...url.searchParams.keys()]) if (!["checkIn", "checkOut", "guests", "roomType", "roomIds", "ids", "id", "reference", "filter", "category", "service", "sort"].includes(name)) url.searchParams.delete(name);
      if (url.hash && !/^#[a-zA-Z][\w-]*$/.test(url.hash)) url.hash = "";
      return url;
    } catch { return new URL(home); }
  }
  function authURL(page = "login", target = window.location.href) {
    const url = new URL("auth/" + (["login", "register", "forgot-password", "reset-password"].includes(page) ? page : "login") + ".html", root);
    const back = safeReturn(target);
    url.searchParams.set("returnTo", back.pathname.slice(root.pathname.length) + back.search + back.hash);
    return url;
  }
  const authTarget = () => safeReturn(new URLSearchParams(window.location.search).get("returnTo"));
  const emit = reason => window.dispatchEvent(new CustomEvent("copyPasteHotel:sessionchange", { detail: { reason } }));
  function clear() {
    window.sessionStorage.removeItem(key);
    for (const name of privateKeys) window.sessionStorage.removeItem(name);
    emit("logout");
  }
  function stored() {
    try {
      const state = JSON.parse(window.sessionStorage.getItem(key) || "null");
      if (!state) return null;
      if (state.version !== version || typeof state.token !== "string" || !state.token || !state.guest?.id || !Number.isFinite(state.expiresAt) || state.expiresAt <= Date.now()) {
        window.sessionStorage.removeItem(key);
        return null;
      }
      return state;
    } catch { return null; }
  }
  const load = () => ({ guest: stored()?.guest || null, error: null });
  const token = () => stored()?.token || null;
  const owner = () => load().guest?.id || null;
  const profile = user => ({ id: String(user.id), fullName: user.name, email: user.email, phone: user.phone || "" });
  async function start(values, register = false) {
    const errors = window.GuestValidation.authErrors(values, register);
    if (Object.keys(errors).length) return { errors };
    try {
      const body = register
        ? { name: values.fullName.trim(), email: values.email.trim(), phone: values.phone.trim(), password: values.password }
        : { email: values.identifier.trim(), password: values.password };
      const result = await window.GuestAPI.request("/auth/" + (register ? "register" : "login"), { method: "POST", body, token: null });
      if (result.user?.role?.toLowerCase() !== "guest" || !result.access_token || !Number.isFinite(result.expires_in)) return { error: "Vui lòng sử dụng tài khoản khách hàng." };
      const guest = profile(result.user);
      clear();
      window.sessionStorage.setItem(key, JSON.stringify({ version, token: result.access_token, guest, expiresAt: Date.now() + result.expires_in * 1000 }));
      emit("start");
      return { guest, error: null };
    } catch (error) { return { error: error.message }; }
  }
  async function refresh() {
    if (!token()) return load();
    const user = await window.GuestAPI.request("/auth/me");
    const state = stored();
    if (!state) throw new Error("Phiên đăng nhập đã hết hạn.");
    if (user.role?.toLowerCase() !== "guest" || String(user.id) !== state.guest.id) { clear(); throw new Error("Phiên đăng nhập không hợp lệ."); }
    state.guest = profile(user);
    window.sessionStorage.setItem(key, JSON.stringify(state));
    emit("profile");
    return load();
  }
  async function logout() {
    try {
      if (token()) await window.GuestAPI.request("/auth/logout", { method: "POST" });
      clear();
      window.location.assign(home.href);
      return { error: null };
    } catch (error) { return { error: error.message }; }
  }
  const initials = name => name.trim().split(/\s+/).filter((_, index, words) => index === 0 || index === words.length - 1).map(word => word[0]).join("").toUpperCase();
  window.GuestSession = Object.freeze({ root: root.href, home: home.href, key, version, privateKeys, safeReturn, authURL, authTarget, load, token, owner, start, refresh, clear, logout, initials });
  const initialOwner = owner();
  window.addEventListener("pagehide", () => { const main = document.querySelector("main"); if (main) main.hidden = true; });
  window.addEventListener("pageshow", event => {
    if (event.persisted && initialOwner !== owner()) { window.location.reload(); return; }
    const main = document.querySelector("main"); if (main) main.hidden = false;
  });
})();
