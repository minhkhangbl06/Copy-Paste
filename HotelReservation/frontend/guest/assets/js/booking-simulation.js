"use strict";

(() => {
  const drafts = window.BookingDraft;
  const rooms = window.HotelRooms;
  const stay = window.RoomStay;
  const dates = window.RoomSearchValidation;
  if (!drafts || !rooms || !stay || !dates) return;
  const key = "copyPasteHotel.simulatedBookings";
  const version = 1;
  const referenceValid = value => typeof value === "string" && /^DEMO-[A-Z0-9-]{8,80}$/.test(value);
  const fingerprint = draft => JSON.stringify({ stay: draft.stay, contact: draft.contact, specialRequest: draft.specialRequest });
  function amountOf(draft) {
    const room = rooms.find(draft.stay.roomType);
    return room.price * draft.stay.roomCount * stay.nights(draft.stay.checkIn, draft.stay.checkOut);
  }
  function validateRecord(record) {
    // Submitted snapshots remain readable after check-in; do not apply today's
    // search-date restrictions to historical records. This is NOT trusted payment data.
    try {
      const d = record.draft;
      const s = d.stay;
      const room = rooms.find(s.roomType);
      if (!referenceValid(record.reference) || d.version !== 1 || !room ||
        !dates.parseDate(s.checkIn) || !dates.parseDate(s.checkOut) || !stay.nights(s.checkIn, s.checkOut) ||
        !Number.isSafeInteger(s.guests) || s.guests < 1 || !Number.isSafeInteger(s.roomCount) || s.roomCount < 1 ||
        Math.ceil(s.guests / room.maxGuests) > s.roomCount || Object.keys(drafts.contactErrors(d.contact, d.specialRequest)).length ||
        !["deposit", "full"].includes(record.plan) || record.bookingStatus !== "PENDING" ||
        record.transferStatus !== "PENDING_REVIEW" || record.confirmedAmount !== 0) return null;
      const total = amountOf(d);
      if (!Number.isSafeInteger(total) || record.reportedAmount !== drafts.paymentAmounts(total, record.plan).amount) return null;
      return { reference: record.reference, draft: { version: 1,
        stay: { roomType: s.roomType, checkIn: s.checkIn, checkOut: s.checkOut, guests: s.guests, roomCount: s.roomCount },
        contact: { fullName: d.contact.fullName, email: d.contact.email, phone: d.contact.phone },
        specialRequest: d.specialRequest, context: {} }, plan: record.plan,
        bookingStatus: "PENDING", transferStatus: "PENDING_REVIEW", reportedAmount: record.reportedAmount, confirmedAmount: 0 };
    } catch { return null; }
  }
  function load() {
    let raw;
    try { raw = window.sessionStorage.getItem(key); }
    catch { return { records: [], error: "unavailable" }; }
    if (raw === null) return { records: [], error: null };
    try {
      const value = JSON.parse(raw);
      if (value.version !== version || !Array.isArray(value.records)) throw Error("schema");
      const records = [], seen = new Set();
      let error = null;
      value.records.forEach(item => {
        const record = validateRecord(item);
        if (!record || seen.has(record.reference)) error = "invalid";
        else { records.push(record); seen.add(record.reference); }
      });
      return { records, error };
    } catch { return { records: [], error: "invalid" }; }
  }
  function prepare(reference = null) {
    const selected = reference === null ? drafts.load().draft?.payment?.reference : reference;
    if (selected && window.BookingData?.paymentContext) return window.BookingData.paymentContext(selected);
    if (reference !== null) {
      if (!referenceValid(reference)) return { draft: null, record: null, error: "invalid" };
      const journal = load();
      const record = journal.records.find(item => item.reference === reference);
      if (record) return { draft: { ...record.draft, payment: { reference, plan: record.plan } }, record, error: journal.error };
      const saved = drafts.load();
      if (saved.draft?.payment?.reference !== reference) return { draft: null, record: null, error: saved.error || journal.error || "not-found" };
      // Explicit reference is never replaced by another, newer draft or a new ID.
    }
    const saved = drafts.load();
    if (!saved.draft) return { ...saved, record: null };
    const draft = saved.draft;
    const journal = load();
    if (journal.error) return { draft, record: null, error: journal.error };
    if (!draft.payment) {
      // Generate once and persist, never on render/reload. Backend will issue real IDs.
      try {
        let reference;
        do {
          const bytes = new Uint8Array(16);
          window.crypto.getRandomValues(bytes);
          reference = "DEMO-" + [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
        } while (journal.records.some(record => record.reference === reference));
        draft.payment = { reference, plan: "deposit" };
        if (!drafts.save(draft)) throw Error("storage");
      } catch { return { draft, record: null, error: "unavailable" }; }
    }
    const record = journal.records.find(item => item.reference === draft.payment.reference) || null;
    if (record && (fingerprint(record.draft) !== fingerprint(draft) || record.plan !== draft.payment.plan)) return { draft, record: null, error: "mismatch" };
    return { draft, record, error: null };
  }
  function choose(plan, reference = null) {
    const current = prepare(reference);
    if (current.error || !current.draft || current.record || !["deposit", "full"].includes(plan)) return false;
    if (window.BookingData?.savePaymentPlan) return window.BookingData.savePaymentPlan(current.draft.payment.reference, plan);
    current.draft.payment.plan = plan;
    return drafts.save(current.draft);
  }
  function send(expected, reference = null) {
    const current = prepare(reference);
    if (current.error || !current.draft) return { record: null, error: current.error || "invalid" };
    const draft = current.draft;
    if (expected.reference !== draft.payment.reference || expected.plan !== draft.payment.plan || expected.fingerprint !== fingerprint(draft)) {
      return { record: null, error: "mismatch" };
    }
    if (current.record) return { record: current.record, error: null };
    const journal = load();
    if (journal.error) return { record: null, error: journal.error };
    const record = validateRecord({ reference: draft.payment.reference, draft, plan: draft.payment.plan,
      bookingStatus: "PENDING", transferStatus: "PENDING_REVIEW", confirmedAmount: 0,
      reportedAmount: drafts.paymentAmounts(amountOf(draft), draft.payment.plan).amount });
    if (!record) return { record: null, error: "invalid" };
    try {
      // Single journal write is the authoritative handoff. Never clear other keys,
      // modify a submitted snapshot or count a guest's report as confirmed money.
      const serialized = JSON.stringify({ version, records: [...journal.records, record] });
      window.sessionStorage.setItem(key, serialized);
      if (window.sessionStorage.getItem(key) !== serialized) throw Error("storage");
      return { record, error: null };
    } catch { return { record: null, error: "unavailable" }; }
  }
  // Session-only simulation, not a database/authentication/payment receipt.
  // M3/M4 must replace this adapter with real booking and bank-reconciliation APIs.
  window.BookingSimulation = Object.freeze({ key, version, load, prepare, choose, send, fingerprint, amountOf });
})();
