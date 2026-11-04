"use strict";
(() => {
  const base = window.BookingData, rooms = window.HotelRooms, stay = window.RoomStay;
  const drafts = window.BookingDraft, validation = window.RoomSearchValidation, simulation = window.BookingSimulation;
  if (!base || !rooms || !stay || !drafts || !validation || !simulation) return;
  const key = "copyPasteHotel.bookingUpdates", version = 1;
  const initialSamples = new Map(base.load().bookings.filter(b => b.source === "sample").map(b => [b.reference,b]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const validStay = s => s && rooms.find(s.roomType) && validation.parseDate(s.checkIn) && validation.parseDate(s.checkOut) &&
    stay.nights(s.checkIn,s.checkOut) && Number.isSafeInteger(s.guests) && s.guests>0 && Number.isSafeInteger(s.roomCount) && s.roomCount>0 &&
    Math.ceil(s.guests/rooms.find(s.roomType).maxGuests)<=s.roomCount;
  const validContact = c => c === null || c && !Object.keys(drafts.contactErrors(c,"")).length;
  const timestamp = value => typeof value==="string" && Number.isFinite(Date.parse(value));
  function validEntry(e) {
    try {
      const b=e.value, sample=initialSamples.get(e.reference);
      if (!b || b.reference!==e.reference || !Number.isSafeInteger(e.revision) || e.revision<1 || !timestamp(e.updatedAt) ||
        !validStay(b.stay) || !validContact(b.contact) || typeof b.specialRequest!=="string" || b.specialRequest.length>1000 ||
        !Number.isSafeInteger(b.roomAmount) || b.roomAmount<0) return false;
      if (sample) {
        if (b.stay.roomType!==sample.stay.roomType || ![sample.bookingStatus,...(["PENDING","CONFIRMED"].includes(sample.bookingStatus)?["CANCEL_REQUESTED","CANCELLED"]:[])].includes(b.bookingStatus)) return false;
      } else if (!/^DEMO-[A-Z0-9-]{8,80}$/.test(e.reference) || !["PENDING","CANCEL_REQUESTED","CANCELLED"].includes(b.bookingStatus) ||
        !["draft","simulation"].includes(b.source) || b.confirmedAmount!==0 ||
        !["AWAITING_PAYMENT","PENDING_REVIEW"].includes(b.paymentStatus) || !["deposit","full"].includes(b.plan) ||
        !Number.isSafeInteger(b.reportedAmount) || b.reportedAmount<0) return false;
      if (e.adjustment && (e.adjustment.status!=="PENDING" || !validStay(e.adjustment.stay) ||
        e.adjustment.stay.roomType!==b.stay.roomType || !validContact(e.adjustment.contact) || !e.adjustment.contact ||
        typeof e.adjustment.specialRequest!=="string" || e.adjustment.specialRequest.length>1000 ||
        !Number.isSafeInteger(e.adjustment.roomAmount) || !timestamp(e.adjustment.createdAt))) return false;
      if (e.cancellation && (!["CANCELLED","CANCEL_REQUESTED"].includes(e.cancellation.status) ||
        e.cancellation.status!==b.bookingStatus || typeof e.cancellation.reason!=="string" || e.cancellation.reason.length>1000 || !timestamp(e.cancellation.createdAt))) return false;
      if (["CANCELLED","CANCEL_REQUESTED"].includes(b.bookingStatus) && !e.cancellation && sample?.bookingStatus!==b.bookingStatus) return false;
      return true;
    } catch { return false; }
  }
  function read() {
    let raw;
    try { raw=window.sessionStorage.getItem(key); } catch { return {entries:[],error:"unavailable"}; }
    if(raw===null) return {entries:[],error:null};
    try {
      const value=JSON.parse(raw);
      if(value.version!==version || !Array.isArray(value.entries)) throw Error("schema");
      const entries=[],seen=new Set();let error=null;
      for(const e of value.entries) {
        if(!validEntry(e) || seen.has(e.reference)) error="invalid";
        else {entries.push(e);seen.add(e.reference);}
      }
      return {entries,error};
    } catch {return {entries:[],error:"invalid"};}
  }
  function load() {
    const original=base.load(),updates=read(),map=new Map(original.bookings.map(b=>[b.reference,{...b,revision:0}]));
    for(const e of updates.entries) {
      const current=map.get(e.reference);
      let value=clone(e.value);
      if(current) {
        // Submitted/payment facts remain authoritative within the simulation; edits
        // never alter a submitted transfer snapshot or fabricate confirmed money.
        value={...value,source:current.source,paymentStatus:current.paymentStatus,reportedAmount:current.reportedAmount,
          confirmedAmount:current.confirmedAmount,plan:current.plan};
        if(current.source==="simulation") value={...value,stay:current.stay,contact:current.contact,
          specialRequest:current.specialRequest,roomAmount:current.roomAmount};
      }
      map.set(e.reference,{...value,revision:e.revision,adjustment:e.adjustment||null,cancellation:e.cancellation||null});
    }
    return {bookings:[...map.values()],error:original.error||updates.error};
  }
  const canPay = b => b.bookingStatus==="PENDING" && b.paymentStatus==="AWAITING_PAYMENT" && b.reportedAmount===0 && b.confirmedAmount===0;
  const canViewPayment = b => b.bookingStatus==="PENDING" && b.paymentStatus==="PENDING_REVIEW";
  const canEdit = b => canPay(b) || b.bookingStatus==="CONFIRMED";
  const canCancel = b => ["PENDING","CONFIRMED"].includes(b.bookingStatus) &&
    (b.bookingStatus==="CONFIRMED" || ["AWAITING_PAYMENT","PENDING_REVIEW"].includes(b.paymentStatus));
  function current(reference,revision) {
    const saved=load(),booking=saved.bookings.find(b=>b.reference===reference);
    if(saved.error || !booking) return {error:"Không thể đọc đầy đủ dữ liệu. Vui lòng thử lại."};
    if(revision!==booking.revision) return {error:"Booking đã thay đổi. Vui lòng tải lại thông tin trước khi thao tác."};
    return {booking};
  }
  function commit(booking,extras={}) {
    const saved=read();if(saved.error)return {error:"Chưa lưu được thay đổi. Vui lòng thử lại."};
    const at=new Date().toISOString();
    const previous=saved.entries.find(e=>e.reference===booking.reference);
    const entry={reference:booking.reference,value:clone(booking),revision:booking.revision+1,updatedAt:at,
      adjustment:previous?.adjustment||null,cancellation:previous?.cancellation||null,...extras};
    delete entry.value.adjustment;delete entry.value.cancellation;delete entry.value.revision;
    if(!validEntry(entry))return {error:"Thông tin thay đổi không hợp lệ."};
    try {
      const text=JSON.stringify({version,entries:[...saved.entries.filter(e=>e.reference!==booking.reference),entry]});
      window.sessionStorage.setItem(key,text);
      if(window.sessionStorage.getItem(key)!==text)throw Error("storage");
      return {error:null};
    }catch{return {error:"Chưa lưu được thay đổi. Vui lòng thử lại."};}
  }
  function update(reference,revision,values) {
    const result=current(reference,revision);if(result.error)return result;
    const b=result.booking;if(!canEdit(b))return {error:"Booking hiện không thể điều chỉnh."};
    const criteria={roomType:b.stay.roomType,checkIn:values.checkIn,checkOut:values.checkOut,guests:values.guests,roomCount:values.roomCount};
    const changed=["checkIn","checkOut","guests","roomCount"].some(k=>String(b.stay[k])!==String(criteria[k]));
    if(b.bookingStatus==="CONFIRMED"&&changed&&b.adjustment)return {error:"Đã có yêu cầu điều chỉnh lưu trú đang chờ. Bạn vẫn có thể cập nhật liên hệ và ghi chú."};
    const errors={...((b.bookingStatus==="CONFIRMED"&&!changed)?{}:stay.validate(criteria,rooms.find(b.stay.roomType))),
      ...drafts.contactErrors(values.contact,values.specialRequest)};
    if(Object.keys(errors).length)return {errors};
    const selected={roomType:b.stay.roomType,checkIn:criteria.checkIn,checkOut:criteria.checkOut,guests:Number(criteria.guests),roomCount:Number(criteria.roomCount)};
    const total=changed||canPay(b)?stay.quote(criteria,rooms.find(b.stay.roomType))?.amount:b.roomAmount;
    if(!Number.isSafeInteger(total))return {error:"Không thể tính tiền phòng. Vui lòng kiểm tra ngày và số phòng."};
    const contact={fullName:values.contact.fullName.trim(),email:values.contact.email.trim(),phone:values.contact.phone.trim()};
    const updated={...b,contact,specialRequest:values.specialRequest};
    if(b.bookingStatus==="CONFIRMED"&&changed) return commit(updated,{adjustment:{status:"PENDING",stay:selected,contact,
      specialRequest:values.specialRequest,roomAmount:total,createdAt:new Date().toISOString()}});
    return commit({...updated,stay:selected,roomAmount:total});
  }
  function cancel(reference,revision,reason) {
    const result=current(reference,revision);if(result.error)return result;
    const b=result.booking;if(!canCancel(b))return {error:"Booking hiện không thể hủy hoặc đã có yêu cầu đang chờ."};
    if(typeof reason!=="string"||reason.length>1000)return {error:"Lý do hủy không được vượt quá 1.000 ký tự."};
    const status=canPay(b)?"CANCELLED":"CANCEL_REQUESTED";
    return commit({...b,bookingStatus:status},{cancellation:{status,reason,createdAt:new Date().toISOString()}});
  }
  function draftOverride(draft) {
    if(!draft?.payment)return draft;
    const saved=read();if(saved.error)return draft;
    const e=saved.entries.find(e=>e.reference===draft.payment.reference);if(!e)return draft;
    const b=e.value;if(b.bookingStatus!=="PENDING"||b.paymentStatus!=="AWAITING_PAYMENT")return draft;
    return drafts.validate({...draft,stay:b.stay,contact:b.contact,specialRequest:b.specialRequest,
      payment:{reference:b.reference,plan:b.plan}})||draft;
  }
  function paymentContext(reference) {
    const saved=load(),b=saved.bookings.find(item=>item.reference===reference);
    if(!b || saved.error)return {draft:null,record:null,error:saved.error||"not-found"};
    if(!canPay(b)&&!canViewPayment(b))return {draft:null,record:null,error:"blocked"};
    const record=simulation.load().records.find(r=>r.reference===reference)||null;
    const draft={version:1,stay:b.stay,contact:b.contact,specialRequest:b.specialRequest,context:{},
      payment:{reference,plan:b.plan}};
    if(!record&&!drafts.validate(draft))return {draft:null,record:null,error:"invalid"};
    return {draft,record,error:null};
  }
  function savePaymentPlan(reference,plan) {
    const result=current(reference,load().bookings.find(b=>b.reference===reference)?.revision);
    if(result.error||!canPay(result.booking)||!["deposit","full"].includes(plan))return false;
    return !commit({...result.booking,plan}).error;
  }
  // M3 must define approval rules/time limits; M4 must reconcile money/refunds.
  // These per-reference session overlays are not authorization, holds or transactions.
  window.BookingData=Object.freeze({...base,load,canPay,canViewPayment,canEdit,canCancel,update,cancel,draftOverride,paymentContext,savePaymentPlan,
    updatesKey:key,labels:{...base.labels,CANCEL_REQUESTED:"Chờ xử lý hủy"},
    matchesFilter:(b,f)=>f==="upcoming"?["PENDING","CONFIRMED","CANCEL_REQUESTED"].includes(b.bookingStatus):base.matchesFilter(b,f)});
})();
