"use strict";

(() => {
  const script = document.currentScript;
  const form = document.getElementById("search-form");
  const shared = window.RoomSearchValidation;
  if (!script || !form || !shared || form.dataset.searchInitialized) return;
  form.dataset.searchInitialized = "true";
  const siteRoot = new URL("../../", script.src);
  const fields = {
    checkIn: document.getElementById("check-in"),
    checkOut: document.getElementById("check-out"),
    guests: document.getElementById("guests"),
    roomType: document.getElementById("room-type"),
  };
  const validation = shared.attach(form, fields);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  form.addEventListener("submit", event => {
    event.preventDefault();
    const criteria = validation.read();
    const errors = validation.validateAll(criteria);
    if (Object.keys(errors).length) {
      validation.focusFirst(errors);
      return;
    }
    const params = new URLSearchParams({
      checkIn: criteria.checkIn,
      checkOut: criteria.checkOut,
      guests: String(Number(criteria.guests)),
    });
    if (criteria.roomType) params.set("roomType", criteria.roomType);
    const destination = new URL("guest/rooms.html", siteRoot);
    destination.search = params.toString();
    // Frontend criteria only; no real availability or booking confirmation.
    window.location.assign(destination.href);
  });
  document.querySelectorAll("[data-focus-search]").forEach(button => {
    button.addEventListener("click", () => {
      const title = document.getElementById("search-title");
      title.focus({ preventScroll: true });
      title.scrollIntoView({ block: "start", behavior: reducedMotion.matches ? "instant" : "smooth" });
    });
  });
  validation.updateDateBounds();
})();
