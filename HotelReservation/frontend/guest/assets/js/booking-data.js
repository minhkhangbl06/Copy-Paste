"use strict";

(() => {
  // Declared sample states never advance with the clock. CP-B003 uses 10–13/11/2026
  // for in-stay service testing on 11/11/2026, still exactly three nights.
  // Totals remain supplied booking amounts; missing contact/payment facts stay unknown.
  const samples = [
  {
    "reference": "CP-B001",
    "stay": {
      "roomType": "deluxe",
      "checkIn": "2026-11-23",
      "checkOut": "2026-11-26",
      "guests": 2,
      "roomCount": 1
    },
    "bookingStatus": "CONFIRMED",
    "roomAmount": 2400000,
    "roomUnitPrice": 800000,
    "contact": {
      "fullName": "Tống Phước Kiêng",
      "email": "tongphuockieng@gmail.com",
      "phone": "0367 097 876"
    },
    "specialRequest": "Ưu tiên phòng yên tĩnh nếu có thể bố trí.",
    "reviewed": false
  },
  {
    "reference": "CP-B002",
    "stay": {
      "roomType": "standard",
      "checkIn": "2026-11-30",
      "checkOut": "2026-12-02",
      "guests": 2,
      "roomCount": 1
    },
    "bookingStatus": "PENDING",
    "roomAmount": 1000000,
    "roomUnitPrice": 500000,
    "contact": null,
    "specialRequest": "",
    "reviewed": false
  },
  {
    "reference": "CP-B003",
    // Simulated front-desk allocation; service requests never allocate or release rooms.
    "assignedRooms": [{"id":"DEMO-ROOM-F301","number":"301"}],
    "confirmedAmount": 1080000,
    "paymentStatus": "DEPOSIT_CONFIRMED",
    "stay": {
      "roomType": "family",
      "checkIn": "2026-11-10",
      "checkOut": "2026-11-13",
      "guests": 4,
      "roomCount": 1
    },
    "bookingStatus": "CHECKED_IN",
    "roomAmount": 3600000,
    "roomUnitPrice": 1200000,
    "contact": null,
    "specialRequest": "",
    "reviewed": false
  },
  {
    "reference": "CP-B004",
    "stay": {
      "roomType": "standard",
      "checkIn": "2026-10-26",
      "checkOut": "2026-10-28",
      "guests": 2,
      "roomCount": 1
    },
    "bookingStatus": "CHECKED_OUT",
    "roomAmount": 1000000,
    "roomUnitPrice": 500000,
    "contact": null,
    "specialRequest": "",
    "reviewed": false
  },
  {
    "reference": "CP-B005",
    "stay": {
      "roomType": "suite",
      "checkIn": "2026-11-16",
      "checkOut": "2026-11-18",
      "guests": 2,
      "roomCount": 1
    },
    "bookingStatus": "CANCELLED",
    "roomAmount": 3000000,
    "roomUnitPrice": 1500000,
    "contact": null,
    "specialRequest": "",
    "reviewed": false
  }
];

  const simulation = window.BookingSimulation;
  const drafts = window.BookingDraft;
  const rooms = window.HotelRooms;
  const stays = window.RoomStay;
  if (!simulation || !drafts || !rooms || !stays) return;
  const filters = ["all", "upcoming", "staying", "completed", "cancelled"];
  const labels = Object.freeze({ PENDING: "Chờ xác nhận", CONFIRMED: "Đã xác nhận", CHECKED_IN: "Đang lưu trú", CHECKED_OUT: "Đã hoàn tất", CANCELLED: "Đã hủy" });
  const paymentLabels = Object.freeze({ AWAITING_PAYMENT: "Chờ thanh toán", PENDING_REVIEW: "Chờ xác nhận chuyển khoản", DEPOSIT_CONFIRMED: "Đã xác nhận tiền cọc", ROOM_PAID: "Đã thanh toán tiền phòng" });
  function fromDraft(draft, reference, record = null) {
    return { reference, guestId: window.GuestSession?.load().guest?.id || "PUBLIC-DEMO", stay: { ...draft.stay }, contact: { ...draft.contact }, specialRequest: draft.specialRequest,
      roomAmount: simulation.amountOf(draft), bookingStatus: "PENDING", reviewed: false,
      paymentStatus: record ? "PENDING_REVIEW" : "AWAITING_PAYMENT", reportedAmount: record?.reportedAmount || 0,
      confirmedAmount: 0, plan: record?.plan || draft.payment.plan, source: record ? "simulation" : "draft" };
  }
  function load() {
    // Seed bookings are one explicitly declared public design dataset owned by
    // the demo Guest. Other signed-in demo identities do not inherit them.
    const session = window.GuestSession?.load();
    if (session?.error) return { bookings: [], error: session.error };
    const journal = simulation.load();
    const saved = drafts.load();
    const entries = new Map(samples.filter(() => !session?.guest || session.guest.id === "DEMO-GUEST-EXAMPLE").map(item => [item.reference, { ...item, guestId: "DEMO-GUEST-EXAMPLE", stay: { ...item.stay },
      contact: item.contact ? { ...item.contact } : null, source: "sample", paymentStatus: item.paymentStatus || null, reportedAmount: null, confirmedAmount: item.confirmedAmount ?? null }]));
    for (const record of journal.records) entries.set(record.reference, fromDraft(record.draft, record.reference, record));
    // A pending draft appears only after payment assigned its stable DEMO reference.
    // Listing never creates IDs or silently replaces the current draft.
    if (saved.draft?.payment && !entries.has(saved.draft.payment.reference)) {
      entries.set(saved.draft.payment.reference, fromDraft(saved.draft, saved.draft.payment.reference));
    }
    return { bookings: [...entries.values()], error: journal.error || saved.error };
  }
  function assignedRooms(booking){
    const rooms=booking?.assignedRooms;
    if(!Array.isArray(rooms)||rooms.some(r=>!r||typeof r.id!=="string"||!/^[-A-Z0-9]{1,80}$/.test(r.id)||typeof r.number!=="string"||!r.number.trim())||new Set(rooms.map(r=>r.id)).size!==rooms.length)return [];
    return rooms.map(r=>({id:r.id,number:r.number}));
  }
  function normalizeFilter(value) { return filters.includes(value) ? value : "all"; }
  function matchesFilter(booking, filter) {
    if (filter === "all") return true;
    if (filter === "upcoming") return ["PENDING", "CONFIRMED"].includes(booking.bookingStatus);
    return booking.bookingStatus === ({ staying: "CHECKED_IN", completed: "CHECKED_OUT", cancelled: "CANCELLED" })[filter];
  }
  const canPay = booking => booking.source === "draft" && booking.bookingStatus === "PENDING" && booking.paymentStatus === "AWAITING_PAYMENT";
  const canViewPayment = booking => booking.source === "simulation" && booking.paymentStatus === "PENDING_REVIEW" && booking.bookingStatus === "PENDING";
  const canReview = booking => booking.bookingStatus === "CHECKED_OUT" && !booking.reviewed;
  function listURL(base, filter = "all") {
    const url = new URL("my-bookings.html", base);
    if (normalizeFilter(filter) !== "all") url.searchParams.set("filter", filter);
    return url;
  }
  function entryURL(page, booking, base, filter = "all") {
    const url = new URL(page, base);
    url.search = new URLSearchParams({ reference: booking.reference }).toString();
    if (normalizeFilter(filter) !== "all") url.searchParams.set("filter", filter);
    return url;
  }
  // Replace only this read adapter with authenticated M3/M4/M5 APIs later.
  // Session data is neither authorization nor proof that any payment was received.
  window.BookingData = Object.freeze({ assignedRooms, load, labels, paymentLabels, normalizeFilter, matchesFilter, canPay, canViewPayment, canReview, listURL, entryURL });
})();
