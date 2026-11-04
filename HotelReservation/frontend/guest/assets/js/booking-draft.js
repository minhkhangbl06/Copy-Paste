"use strict";

(() => {
  const data = window.HotelRooms;
  const stay = window.RoomStay;
  if (!data || !stay) return;
  const key = "copyPasteHotel.bookingDraft";
  const version = 1;
  const stayKeys = ["roomType", "checkIn", "checkOut", "guests", "roomCount"];
  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const contacts = window.GuestValidation;
  if (!contacts) return;
  const normalizePhone = contacts.normalizePhone, phoneError = contacts.phoneError;
  function contactErrors(contact, specialRequest = "") {
    const errors = contacts.contactErrors(contact);
    if (typeof specialRequest !== "string" || specialRequest.length > 1000)
      errors.specialRequest = "Ghi chú không được vượt quá 1.000 ký tự.";
    return errors;
  }
  function criteriaOf(draft) {
    return {
      ...draft.stay,
      guests: String(draft.stay.guests),
      roomCount: String(draft.stay.roomCount),
      sort: draft.context.sort,
    };
  }
  function validate(value) {
    if (
      !isObject(value) ||
      value.version !== version ||
      !isObject(value.stay) ||
      !isObject(value.contact) ||
      !isObject(value.context)
    )
      return null;
    const selected = value.stay;
    if (
      !["roomType", "checkIn", "checkOut"].every(
        (k) => typeof selected[k] === "string",
      ) ||
      !["guests", "roomCount"].every(
        (k) => Number.isSafeInteger(selected[k]) && selected[k] > 0,
      )
    )
      return null;
    if (Object.keys(contactErrors(value.contact, value.specialRequest)).length)
      return null;
    const context = {
      sort: ["default", "price-asc", "price-desc"].includes(value.context.sort)
        ? value.context.sort
        : "default",
    };
    if (
      value.context.listRoomType === "" ||
      data.find(value.context.listRoomType)
    )
      context.listRoomType = value.context.listRoomType;
    const canonical = {
      version,
      stay: Object.fromEntries(stayKeys.map((k) => [k, selected[k]])),
      contact: {
        fullName: value.contact.fullName.trim(),
        email: value.contact.email.trim(),
        phone: normalizePhone(value.contact.phone.trim()),
      },
      specialRequest: value.specialRequest,
      context,
    };
    if (value.payment !== undefined) {
      if (
        !isObject(value.payment) ||
        !/^DEMO-[A-Z0-9-]{8,80}$/.test(value.payment.reference) ||
        !["deposit", "full"].includes(value.payment.plan)
      )
        return null;
      canonical.payment = {
        reference: value.payment.reference,
        plan: value.payment.plan,
      };
    }
    const criteria = criteriaOf(canonical);
    const room = data.find(criteria.roomType);
    if (
      Object.keys(stay.validate(criteria, room)).length ||
      !stay.quote(criteria, room)
    )
      return null;
    return canonical;
  }
  function create(criteria, contact, specialRequest, params) {
    const context = { sort: criteria.sort || "default" };
    const listRoomType = params.get("listRoomType");
    if (listRoomType !== null) context.listRoomType = listRoomType;
    const draft = validate({
      version,
      stay: {
        roomType: criteria.roomType,
        checkIn: criteria.checkIn,
        checkOut: criteria.checkOut,
        guests: Number(criteria.guests),
        roomCount: Number(criteria.roomCount),
      },
      contact,
      specialRequest,
      context,
    });
    const previous = load().draft;
    if (
      draft &&
      previous?.payment &&
      matches(previous, criteria) &&
      JSON.stringify(previous.contact) === JSON.stringify(draft.contact) &&
      previous.specialRequest === draft.specialRequest &&
      (!window.BookingData?.paymentContext ||
        window.BookingData.paymentContext(previous.payment.reference).draft)
    ) {
      draft.payment = { ...previous.payment };
    }
    return draft;
  }
  function load() {
    let raw;
    try {
      raw = window.sessionStorage.getItem(key);
    } catch {
      return { draft: null, error: "unavailable" };
    }
    if (raw === null) return { draft: null, error: null };
    try {
      let draft = validate(JSON.parse(raw));
      if (draft && window.BookingData?.draftOverride)
        draft = window.BookingData.draftOverride(draft);
      return { draft, error: draft ? null : "invalid" };
    } catch {
      return { draft: null, error: "invalid" };
    }
  }
  function save(value) {
    const draft = validate(value);
    if (!draft) return false;
    try {
      const serialized = JSON.stringify(draft);
      window.sessionStorage.setItem(key, serialized);
      return window.sessionStorage.getItem(key) === serialized;
    } catch {
      return false;
    }
  }
  function matches(draft, criteria) {
    const current = criteriaOf(draft);
    return stayKeys.every((k) =>
      ["guests", "roomCount"].includes(k)
        ? Number(current[k]) === Number(criteria[k])
        : current[k] === criteria[k],
    );
  }
  function bookingURL(draft, base) {
    const url = new URL("booking.html", base);
    url.search = stay
      .paramsFor(criteriaOf(draft), new URLSearchParams(draft.context))
      .toString();
    url.hash = "";
    return url;
  }
  function paymentAmounts(total, plan) {
    const amount = plan === "full" ? total : Math.round((total * 30) / 100);
    return { amount, remaining: total - amount };
  }
  // Frontend-only per-tab draft. Optional DEMO payment metadata is not a real ID
  // or transfer reference. No password/token or confirmed payment is stored here.
  // Replace this storage handoff with authenticated booking/payment APIs on integration.
  window.BookingDraft = Object.freeze({
    key,
    version,
    contactErrors,
    phoneError,
    normalizePhone,
    create,
    load,
    save,
    validate,
    matches,
    criteriaOf,
    bookingURL,
    paymentAmounts,
  });
})();
