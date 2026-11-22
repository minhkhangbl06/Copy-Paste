"use strict";
(() => {
  const api = window.GuestAPI, session = window.GuestSession, reservations = window.GuestReservations;
  const main = document.querySelector("[data-guest-page]");
  if (!main || !api || !session || !reservations) return;
  const params = new URLSearchParams(location.search);
  const page = main.dataset.guestPage;
  const make = (tag, text = "", cls = "") => { const node = document.createElement(tag); node.textContent = text; if (cls) node.className = cls; return node; };
  const url = (name, query = {}) => { const target = new URL("pages/" + name + ".html", session.root); target.search = new URLSearchParams(query).toString(); return target.href; };
  const link = (text, href, cls = "button button-outline") => { const node = make("a", text, cls); node.href = href; return node; };
  const button = (text, action, cls = "button button-primary") => { const node = make("button", text, cls); node.type = "button"; node.addEventListener("click", action); return node; };
  function card(title, parent = main) { const node = make("section", "", "guest-card"); if (title) node.append(make("h2", title)); parent.append(node); return node; }
  function facts(rows, parent) { const dl = make("dl", "", "guest-facts"); for (const [label, value] of rows) { const row = make("div"); row.append(make("dt", label), make("dd", String(value ?? "Chưa có thông tin"))); dl.append(row); } parent.append(dl); }
  const heading = make("h1");
  const feedback = make("p", "Đang tải dữ liệu…", "guest-feedback"); feedback.setAttribute("role", "status"); feedback.tabIndex = -1;
  main.append(heading, feedback);
  function message(text, error = false) { feedback.textContent = text; feedback.hidden = !text; feedback.dataset.error = String(error); }
  function report(error) {
    message(error.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : error.message, true);
    if (!session.token() && !main.querySelector("[data-login-link]")) { const login = link("Đăng nhập", session.authURL("login", location.href).href); login.dataset.loginLink = ""; main.append(login); }
    feedback.focus({ preventScroll: true });
  }
  async function busy(control, action) { if (control.disabled) return; control.disabled = true; try { await action(); } catch (error) { if (error.bookingCreated || error.bookingUncertain) control.dataset.completed = "true"; report(error); } finally { control.disabled = control.dataset.completed === "true"; } }
  function field(form, label, name, type = "text", value = "") {
    const wrap = make("div", "", "guest-field"), id = "guest-" + name;
    const caption = make("label", label); caption.htmlFor = id;
    const input = make(type === "select" ? "select" : type === "textarea" ? "textarea" : "input");
    if (input.tagName === "INPUT") input.type = type;
    input.id = id; input.name = name; input.value = value;
    wrap.append(caption, input); form.append(wrap); return input;
  }
  function option(select, text, value) { const item = make("option", text); item.value = value; select.append(item); }
  function table(headers, rows, parent) {
    const wrap = make("div", "", "guest-table-wrap"), result = make("table", "", "guest-table");
    result.dataset.columns = String(headers.length);
    const head = make("thead"), tr = make("tr");
    headers.forEach(text => { const th = make("th", text); th.scope = "col"; tr.append(th); }); head.append(tr);
    const body = make("tbody");
    for (const row of rows) { const item = make("tr"); row.forEach(value => item.append(make("td", String(value ?? "—")))); body.append(item); }
    result.append(head, body); wrap.append(result); parent.append(wrap);
  }
  const dateLabel = value => api.date(value).split("-").reverse().join("/");
  const bookingIds = () => reservations.readIds(params.get("ids") || params.get("id") || params.get("reference"));
  const groupFor = id => reservations.receipts().find(group => group.includes(Number(id))) || [Number(id)];
  function staySummary(booking, parent = main) {
    const node = card("Thông tin booking", parent), rooms = api.allocations(booking);
    facts([
      ["Mã booking", booking.booking_code], ["Trạng thái", api.bookingLabels[booking.status] || booking.status],
      ["Nhận phòng", dateLabel(booking.check_in_date)], ["Trả phòng", dateLabel(booking.check_out_date)],
      ["Phòng đã chọn", rooms.map(item => item.room?.room_number || item.room_id).join(", ")],
      ["Tổng tiền phòng", api.money(booking.total_room_amount)], ["Cọc yêu cầu", api.money(booking.deposit_amount)],
      ["Cọc đã nhận", api.money(booking.deposit_paid_amount)],
      ["Tình trạng cọc", api.depositLabels[String(booking.deposit_status || "").toLowerCase()] || "Chưa có xác nhận từ khách sạn"],
    ], node);
    table(["Phòng", "Loại phòng", "Tiền phòng"], rooms.map(item => [item.room?.room_number || item.room_id, item.room?.room_type, api.money(item.total_room_amount)]), node);
    return node;
  }

  async function roomsPage() {
    heading.textContent = "Tìm và chọn phòng";
    const panel = card("Thời gian lưu trú"), form = make("form", "", "guest-form");
    const start = field(form, "Ngày nhận phòng", "checkIn", "date", params.get("checkIn") || "");
    const end = field(form, "Ngày trả phòng", "checkOut", "date", params.get("checkOut") || "");
    start.required = end.required = true; start.min = window.RoomSearchValidation.dateKey(new Date());
    const type = field(form, "Loại phòng", "roomType", "select"); option(type, "Tất cả", "");
    const sort = field(form, "Sắp xếp giá", "sort", "select"); option(sort, "Mặc định", ""); option(sort, "Tăng dần", "asc"); option(sort, "Giảm dần", "desc");
    const submit = make("button", "Tìm phòng", "button button-primary"); submit.type = "submit"; form.append(submit); panel.append(form);
    const results = make("div", "", "guest-grid"); main.append(results);
    const selection = card("Phòng đã chọn"); selection.classList.add("guest-selection");
    const selectedText = make("p"), proceed = button("Tiếp tục đặt phòng", () => {}); selection.append(selectedText, proceed);
    let inventory = [], selected = new Set(), applied = null, requestVersion = 0;
    function sync() { selectedText.textContent = selected.size ? inventory.filter(room => selected.has(room.id)).map(room => "Phòng " + room.room_number).join(", ") : "Chưa chọn phòng."; proceed.disabled = !selected.size || !applied; }
    function invalidate() { requestVersion++; applied = null; selected.clear(); results.replaceChildren(); sync(); message("Tiêu chí đã thay đổi. Vui lòng tìm lại phòng."); }
    start.addEventListener("input", () => { end.min = start.value; invalidate(); }); end.addEventListener("input", invalidate);
    function render() {
      results.replaceChildren();
      let filtered = inventory.filter(room => !type.value || room.room_type === type.value);
      if (sort.value) filtered = [...filtered].sort((a, b) => (Number(a.price_per_night) - Number(b.price_per_night)) * (sort.value === "asc" ? 1 : -1));
      for (const room of filtered) {
        const node = card("Phòng " + room.room_number, results);
        node.append(make("p", room.room_type), make("p", api.money(room.price_per_night) + " / đêm (giá cơ bản)"));
        if (applied) {
          const label = make("label", "", "guest-choice"), check = make("input"); check.type = "checkbox"; check.checked = selected.has(room.id);
          check.addEventListener("change", () => { check.checked ? selected.add(room.id) : selected.delete(room.id); sync(); });
          label.append(check, make("span", "Chọn phòng " + room.room_number)); node.append(label);
        } else node.append(make("p", "Chọn ngày để kiểm tra phòng trống."));
      }
      message(filtered.length ? `${filtered.length} phòng${applied ? " còn trống trong thời gian đã chọn" : " trong danh mục"}.` : "Không có phòng phù hợp."); sync();
    }
    async function search() {
      const invalid = window.RoomSearchValidation.validate({ checkIn: start.value, checkOut: end.value, guests: "1", roomType: "" });
      if (Object.keys(invalid).length) throw new Error(Object.values(invalid).join(" "));
      const version = ++requestVersion, criteria = { checkIn: start.value, checkOut: end.value };
      selected.clear(); applied = null; results.replaceChildren(); sync(); message("Đang tìm phòng trống…");
      const found = await api.request("/rooms/available?" + new URLSearchParams({ check_in_date: criteria.checkIn, check_out_date: criteria.checkOut }));
      if (version !== requestVersion) return;
      inventory = found.rooms; applied = criteria;
      const types = [...new Set(inventory.map(room => room.room_type))]; const previous = type.value;
      type.replaceChildren(); option(type, "Tất cả", ""); types.forEach(name => option(type, name, name)); type.value = types.includes(previous) ? previous : "";
      history.replaceState(null, "", url("rooms", criteria)); render();
    }
    form.addEventListener("submit", event => { event.preventDefault(); busy(submit, search); });
    type.addEventListener("change", render); sort.addEventListener("change", render);
    proceed.addEventListener("click", () => { if (selected.size && applied) location.assign(url("booking", { ...applied, roomIds: [...selected].join(",") })); });
    if (start.value || end.value) await search();
    else {
      inventory = await api.request("/rooms");
      [...new Set(inventory.map(room => room.room_type))].forEach(name => option(type, name, name));
      const requestedType = params.get("roomType"); if ([...type.options].some(item => item.value === requestedType)) type.value = requestedType;
      render();
    }
  }

  async function bookingPage() {
    heading.textContent = "Xác nhận đặt phòng";
    const payload = reservations.selection(params);
    const rooms = await reservations.selectedRooms(payload);
    const nights = Math.round((Date.parse(payload.check_out_date) - Date.parse(payload.check_in_date)) / 86400000);
    const estimate = rooms.reduce((total, room) => total + Number(room.price_per_night) * nights, 0);
    const summary = card("Các phòng đã chọn");
    table(["Phòng", "Loại phòng", "Giá cơ bản / đêm"], rooms.map(room => [room.room_number, room.room_type, api.money(room.price_per_night)]), summary);
    facts([["Nhận phòng", dateLabel(payload.check_in_date)], ["Trả phòng", dateLabel(payload.check_out_date)], ["Số đêm", nights], ["Tạm tính theo giá cơ bản", api.money(estimate)]], summary);
    summary.append(make("p", "Giá cơ bản chưa gồm phụ thu cuối tuần. Tổng tiền chính thức và cọc yêu cầu được máy chủ trả về sau khi đặt phòng.", "guest-note"));
    const contact = card("Thông tin liên hệ"), form = make("form", "", "guest-form"), guest = session.load().guest;
    const name = field(form, "Họ và tên", "guest_name", "text", guest.fullName); name.required = true; name.minLength = 2; name.maxLength = 255;
    const phone = field(form, "Số điện thoại", "guest_phone", "tel", guest.phone); phone.required = true; phone.maxLength = 20;
    const submit = make("button", "Xác nhận đặt phòng", "button button-primary"); submit.type = "submit"; form.append(submit); contact.append(form);
    form.addEventListener("submit", event => { event.preventDefault(); busy(submit, async () => {
      const phoneError = window.GuestValidation.phoneError(phone.value); if (phoneError) throw new Error(phoneError);
      const result = await reservations.create({ ...payload, guest_name: name.value.trim(), guest_phone: phone.value.trim() });
      submit.dataset.completed = "true";
      location.assign(url("invoice", { ids: result.ids.join(",") }));
    }); });
    main.append(link("Chọn lại phòng", url("rooms", { checkIn: payload.check_in_date, checkOut: payload.check_out_date })));
    message("");
  }

  async function bookingsPage() {
    heading.textContent = "Booking của tôi";
    const bookings = await reservations.list();
    main.append(make("p", "Danh sách các booking bạn đã tạo trong phiên đăng nhập này. Thông tin và số tiền được tải lại từ khách sạn.", "guest-note"));
    const toolbar = make("div", "", "guest-toolbar"), label = make("label", "Trạng thái booking"); label.htmlFor = "booking-filter";
    const filter = make("select"); filter.id = "booking-filter"; option(filter, "Tất cả", ""); Object.entries(api.bookingLabels).forEach(([value, text]) => option(filter, text, value)); toolbar.append(label, filter, link("Đặt thêm phòng", url("rooms"))); main.append(toolbar);
    const list = make("div"); main.append(list);
    function render() {
      list.replaceChildren(); const visible = bookings.filter(booking => !filter.value || booking.status === filter.value);
      for (const booking of visible) {
        const node = staySummary(booking, list), actions = make("div", "", "guest-actions");
        actions.append(link("Xem hóa đơn lượt đặt", url("invoice", { ids: groupFor(booking.id).join(",") })));
        if (booking.status === "checked_in") actions.append(link("Gọi dịch vụ", url("services", { ids: groupFor(booking.id).join(",") })));
        node.append(actions);
      }
      message(visible.length ? "" : "Bạn chưa có booking trong nhóm này.");
    }
    filter.addEventListener("change", render); render();
  }

  async function invoicePage() {
    heading.textContent = "Hóa đơn lưu trú";
    const ids = bookingIds(), bookings = await reservations.load(ids);
    const totalOf = key => bookings.every(booking => booking[key] != null && Number.isFinite(Number(booking[key]))) ? bookings.reduce((total, booking) => total + Number(booking[key]), 0) : null;
    const overview = card("Các phòng trong lượt đặt");
    facts([
      ["Mã booking", bookings.map(booking => booking.booking_code).join(", ")],
      ["Phòng đã chọn", bookings.flatMap(booking => api.allocations(booking).map(room => room.room?.room_number || room.room_id)).join(", ")],
      ["Tổng tiền phòng", api.money(totalOf("total_room_amount"))],
      ["Tổng cọc yêu cầu", api.money(totalOf("deposit_amount"))],
      ["Tổng cọc đã nhận", api.money(totalOf("deposit_paid_amount"))],
    ], overview);
    bookings.forEach(booking => staySummary(booking));
    const results = await Promise.allSettled(bookings.map(booking => reservations.invoice(booking)));
    let complete = true, total = 0;
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        complete = false;
        card("Hóa đơn " + bookings[index].booking_code).append(make("p", result.reason.message, "guest-note"));
        return;
      }
      const data = result.value, parent = card(data.invoice ? "Hóa đơn " + data.invoice.invoice_code : "Bảng kê tạm tính " + data.booking.booking_code);
      if (!data.detailAvailable) parent.append(make("p", "Khách sạn chưa cung cấp chi tiết các khoản theo từng phòng.", "guest-note"));
      for (const group of api.groupItems(data.invoice_items, api.allocations(data.booking))) {
        const node = card(group.room ? "Chi tiết phòng " + (group.room.room?.room_number || group.room.room_id) : "Các khoản chung của booking", parent);
        if (!group.items.length) { node.append(make("p", "Chưa có dòng hóa đơn cho phòng này.")); continue; }
        table(["Nội dung", "Số lượng", "Đơn giá", "Thành tiền"], group.items.map(item => [item.description, item.quantity, api.money(item.unit_price), api.money(item.amount)]), node);
        node.append(make("p", "Cộng các dòng: " + api.money(group.items.reduce((sum, item) => sum + Number(item.amount), 0))));
      }
      const charges = data.charges;
      facts([
        ["Tiền phòng", api.money(charges.room_charges)], ["Tiền dịch vụ", api.money(charges.service_charges)],
        ["Phụ thu trả muộn", api.money(charges.late_checkout_fee)], ["Phụ thu khác", api.money(charges.other_surcharges)],
        ["Tiền cọc API khấu trừ", api.money(charges.deposit_deducted)], ["Thuế", api.money(charges.tax_amount)],
        ["Tổng hóa đơn sau khấu trừ cọc", api.money(charges.total_amount)],
      ], parent);
      if (data.invoice && Array.isArray(data.invoice.payments)) {
        const paid = data.invoice.payments.filter(payment => payment.status === "success").reduce((sum, payment) => sum + Number(payment.amount), 0);
        facts([["Đã thanh toán hóa đơn", api.money(paid)], ["Còn phải thanh toán", api.money(Math.max(0, Number(charges.total_amount) - paid))]], parent);
        table(["Thời gian", "Phương thức", "Trạng thái", "Số tiền"], data.invoice.payments.map(payment => [dateLabel(payment.created_at), payment.payment_method, payment.status, api.money(payment.amount)]), parent);
      }
      if (charges.total_amount == null || !Number.isFinite(Number(charges.total_amount))) complete = false;
      else total += Number(charges.total_amount);
    });
    const summary = card("Tổng các hóa đơn trong lượt đặt"); summary.append(make("p", complete ? api.money(total) : "Chưa tải đủ các hóa đơn để tính tổng.", "guest-amount"));
    message("Tổng tiền và khoản khấu trừ lấy từ khách sạn. Bảng kê tạm tính không phải xác nhận đã nhận cọc.");
    const actions = make("div", "", "guest-actions"); actions.append(link("Booking của tôi", url("my-bookings")));
    if (bookings.some(booking => booking.status === "checked_in")) actions.append(link("Gọi dịch vụ", url("services", { ids: ids.join(",") })));
    main.append(actions);
  }

  async function servicesPage(historyOnly = false) {
    heading.textContent = historyOnly ? "Lịch sử dịch vụ" : "Gọi dịch vụ theo phòng";
    const [bookings, catalog] = await Promise.all([reservations.list(), historyOnly ? Promise.resolve([]) : api.request("/services")]);
    const eligible = historyOnly ? bookings : bookings.filter(booking => booking.status === "checked_in");
    if (!eligible.length) { message(historyOnly ? "Bạn chưa có booking." : "Bạn cần có booking đang lưu trú để gọi dịch vụ."); main.append(link("Booking của tôi", url("my-bookings"))); return; }
    const picker = card("Chọn booking và phòng"), controls = make("div", "", "guest-form"), bookingSelect = field(controls, "Booking", "booking", "select");
    const groups = reservations.receipts().map(ids => eligible.filter(booking => ids.includes(Number(booking.id)))).filter(group => group.length);
    groups.forEach(group => option(bookingSelect, group.map(booking => booking.booking_code).join(", "), group.map(booking => booking.id).join(",")));
    const requested = params.get("ids") || params.get("id");
    if ([...bookingSelect.options].some(item => item.value === requested)) bookingSelect.value = requested;
    const roomSelect = historyOnly ? null : field(controls, "Phòng sử dụng dịch vụ", "booking_room_id", "select"); picker.append(controls);
    const orderArea = make("div"), historyArea = make("div"); main.append(orderArea, historyArea);
    let version = 0;
    async function render() {
      const currentVersion = ++version, selectedIds = reservations.readIds(bookingSelect.value);
      orderArea.replaceChildren(); historyArea.replaceChildren();
      const selectedBookings = eligible.filter(item => selectedIds.includes(Number(item.id)));
      const choices = selectedBookings.flatMap(booking => api.allocations(booking).map(room => ({ booking, room, key: booking.id + ":" + (room.id ?? "legacy") })));
      if (roomSelect) {
        roomSelect.replaceChildren(); option(roomSelect, "Chọn phòng", "");
        choices.forEach(choice => option(roomSelect, "Phòng " + (choice.room.room?.room_number || choice.room.room_id) + " — " + choice.booking.booking_code, choice.key));
        if (roomSelect.options.length === 1) message("Booking cũ chưa có phân phòng. Vui lòng liên hệ lễ tân.");
      }
      if (!historyOnly) {
        const node = card("Danh mục dịch vụ", orderArea), form = make("form");
        const quantities = [];
        for (const service of catalog) {
          const input = field(form, `${service.name} — ${api.money(service.price)} / ${service.unit || "lượt"}`, "service-" + service.id, "number", "0");
          input.min = 0; input.max = 100; input.step = 1; quantities.push({ service, input });
        }
        const notes = field(form, "Ghi chú", "service_notes", "textarea"); notes.maxLength = 2000;
        const submit = make("button", "Gửi yêu cầu dịch vụ", "button button-primary"); submit.type = "submit";
        submit.disabled = !catalog.length; form.append(submit); node.append(form);
        if (!catalog.length) node.append(make("p", "Chưa có dịch vụ đang phục vụ."));
        form.addEventListener("submit", event => { event.preventDefault(); busy(submit, async () => {
          if (!roomSelect.value) throw new Error("Vui lòng chọn phòng trong booking.");
          const items = quantities.filter(row => Number(row.input.value) > 0).map(row => ({ service_id: row.service.id, quantity: Number(row.input.value) }));
          if (!items.length || items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)) throw new Error("Chọn ít nhất một dịch vụ với số lượng từ 1 đến 100.");
          const choice = choices.find(item => item.key === roomSelect.value);
          if (!choice) throw new Error("Phòng đã chọn không thuộc lượt đặt này.");
          const order = await reservations.order(choice.booking, choice.room, items, notes.value.trim());
          if (currentVersion !== version) return;
          quantities.forEach(row => { row.input.value = "0"; }); notes.value = "";
          message("Đã gửi yêu cầu " + order.order_code + ". Tổng tiền: " + api.money(order.total_amount));
          await loadHistory(selectedBookings, currentVersion);
        }); });
      }
      await loadHistory(selectedBookings, currentVersion);
    }
    async function loadHistory(selectedBookings, expectedVersion) {
      const orders = (await Promise.all(selectedBookings.map(booking => reservations.orders(booking)))).flat();
      if (expectedVersion !== version) return;
      historyArea.replaceChildren(); const node = card("Dịch vụ đang ghi vào phòng", historyArea);
      node.append(make("p", "Danh sách theo bảng kê khách sạn trả về; chưa bao gồm đơn đã hủy hoặc đã thanh toán riêng."));
      if (!orders.length) node.append(make("p", "Bảng kê chưa có dịch vụ ghi vào phòng."));
      for (const order of orders) {
        const entry = card(order.order_code, node);
        const allocation = selectedBookings.flatMap(booking => api.allocations(booking)).find(room => String(room.room_id) === String(order.room_id));
        facts([["Phòng", order.booking_room?.room?.room_number || order.room?.room_number || allocation?.room?.room_number || order.room_id], ["Trạng thái", ({ pending: "Chờ xác nhận", confirmed: "Đã xác nhận", in_progress: "Đang thực hiện", delivered: "Đã phục vụ", cancelled: "Đã hủy" })[order.status] || order.status], ["Tổng tiền", api.money(order.total_amount)]], entry);
        table(["Dịch vụ", "Số lượng", "Thành tiền"], order.items.map(item => [item.service?.name, item.quantity, api.money(item.amount ?? item.subtotal)]), entry);
      }
    }
    bookingSelect.addEventListener("change", () => { message(""); render().catch(report); });
    message(""); await render();
  }

  async function profilePage() {
    heading.textContent = "Thông tin tài khoản";
    const guest = session.load().guest;
    facts([["Họ và tên", guest.fullName], ["Email", guest.email], ["Số điện thoại", guest.phone || "Chưa cập nhật"]], card("Hồ sơ khách hàng"));
    main.append(link("Booking của tôi", url("my-bookings")));
    message("");
  }
  async function init() {
    if (!["rooms", "room-detail"].includes(page)) {
      if (!session.token()) { location.replace(session.authURL("login", location.href).href); return; }
      await session.refresh();
    }
    if (["rooms", "room-detail"].includes(page)) await roomsPage();
    else if (page === "booking") await bookingPage();
    else if (page === "my-bookings") await bookingsPage();
    else if (["invoice", "booking-detail", "booking-payment"].includes(page)) await invoicePage();
    else if (["services", "food-menu", "food-cart"].includes(page)) await servicesPage();
    else if (page === "service-history") await servicesPage(true);
    else if (page === "profile") await profilePage();
    else { heading.textContent = "Đánh giá lưu trú"; message("Chức năng đánh giá chưa có API hỗ trợ."); main.append(link("Booking của tôi", url("my-bookings"))); }
  }
  init().catch(report);
})();
