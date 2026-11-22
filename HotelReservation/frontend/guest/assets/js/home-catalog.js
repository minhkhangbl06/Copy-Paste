"use strict";
(() => {
  const host = document.querySelector("[data-home-rooms]"), select = document.getElementById("room-type");
  if (!host) return;
  window.GuestAPI.request("/rooms").then(rooms => {
    host.replaceChildren();
    const types = new Map();
    for (const room of rooms) {
      const previous = types.get(room.room_type);
      if (!previous || Number(room.price_per_night) < Number(previous.price_per_night)) types.set(room.room_type, room);
    }
    for (const [type, room] of types) {
      const article = document.createElement("article"); article.className = "room-card";
      const content = document.createElement("div"); content.className = "room-content";
      const title = document.createElement("h3"); title.textContent = type;
      const price = document.createElement("p"); price.textContent = "Giá cơ bản từ " + window.GuestAPI.money(room.price_per_night) + " / đêm";
      const link = document.createElement("a"); link.className = "room-action"; link.textContent = "Tìm phòng";
      const target = new URL("pages/rooms.html", window.GuestSession.root); target.searchParams.set("roomType", type); link.href = target.href;
      content.append(title, price, link); article.append(content); host.append(article);
      if (select) { const option = document.createElement("option"); option.value = type; option.textContent = type; select.append(option); }
    }
    if (!types.size) host.textContent = "Chưa có phòng trong danh mục.";
  }).catch(error => { host.textContent = error.message; });
})();
