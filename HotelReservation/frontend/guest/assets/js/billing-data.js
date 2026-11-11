"use strict";
(() => {
  const bookings=window.BookingData,extras=window.BookingExtras,services=window.ServiceRequests,dates=window.RoomSearchValidation;
  if(!bookings||!extras||!services||!dates)return;
  // Read-only optional invoice snapshot adapter, not a second booking/payment
  // ledger. No page visit creates/finalizes invoices or writes storage.
  // v1: {invoices:[{bookingReference,status:'FINALIZED',stay,room:{name,
  // unitPrice,amount},services:[request snapshots],surcharges:[],discounts:[],
  // transactions:[],confirmedAmount?}]}. Lines: {id,label,amount}.
  // M4 will supply immutable invoices and its canonical transaction/refund model.
  const key="copyPasteHotel.invoices",version=1;
  const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
  const money=v=>Number.isSafeInteger(v)&&v>=0;
  const positive=v=>Number.isSafeInteger(v)&&v>0;
  const text=v=>typeof v==="string"&&Boolean(v.trim());
  const sum=values=>{const n=values.reduce((a,b)=>a+b,0);return money(n)?n:null;};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function validStay(s){return object(s)&&text(s.roomType)&&dates.parseDate(s.checkIn)&&dates.parseDate(s.checkOut)&&
    window.RoomStay.nights(s.checkIn,s.checkOut)>0&&positive(s.guests)&&positive(s.roomCount);}
  function snapshots(){
    try{
      const raw=window.sessionStorage.getItem(key);if(raw===null)return {invoices:[],error:null};
      const saved=JSON.parse(raw);if(saved.version!==version||!Array.isArray(saved.invoices))throw Error();
      const seen=new Set();for(const i of saved.invoices){
        if(!object(i)||!text(i.bookingReference)||seen.has(i.bookingReference)||i.status!=="FINALIZED"||!validStay(i.stay)||
          !object(i.room)||!text(i.room.name)||!money(i.room.amount)||(i.room.unitPrice!==null&&!money(i.room.unitPrice))||
          !Array.isArray(i.services)||!Array.isArray(i.surcharges)||!Array.isArray(i.discounts)||!Array.isArray(i.transactions))throw Error();
        seen.add(i.bookingReference);
      }
      return {invoices:saved.invoices,error:null};
    }catch{return {invoices:[],error:"Không thể đọc đầy đủ hóa đơn đã lưu. Vui lòng thử lại."};}
  }
  function feeLines(value,label,errors){
    if(!Array.isArray(value)||value.some(i=>!object(i)||!text(i.id)||!text(i.label)||!money(i.amount))||new Set(value.map(i=>i.id)).size!==value.length){errors.push("Chưa đủ dữ liệu "+label+".");return null;}
    const total=sum(value.map(i=>i.amount));if(total===null)errors.push("Số tiền "+label+" không hợp lệ.");return total;
  }
  function serviceFacts(requests,reference,errors,frozen=false){
    const charged=[],pending=[],seen=new Set();
    if(!Array.isArray(requests)){errors.push("Chưa đủ dữ liệu dịch vụ.");return {charged,pending,total:null};}
    let invalid=false;
    for(const r of requests){
      // Ordinary in-stay housekeeping is included, never a fee or pending quote.
      if(object(r)&&r.bookingReference===reference&&r.type==="housekeeping")continue;
      if(!object(r)||r.bookingReference!==reference||!text(r.id)||seen.has(r.id)||!services.name(r.type)||
        !["PENDING","PROCESSING","CONFIRMED","COMPLETED","CANCELLED"].includes(r.status)){
        invalid=true;continue;
      }
      seen.add(r.id);
      if(r.status==="CANCELLED")continue;
      if(r.costConfirmed!==null&&r.costConfirmed!==undefined&&!money(r.costConfirmed)){invalid=true;continue;}
      if(!services.billable(r)){
        if(frozen){invalid=true;continue;}
        pending.push({...clone(r),label:services.label(r),explanation:r.status==="COMPLETED"?"Chưa có chi phí được xác nhận.":"Chưa đủ điều kiện ghi nhận chi phí."});continue;
      }
      if(r.type==="food"){
        if(!Array.isArray(r.items)||!r.items.length||r.items.some(i=>!object(i)||!text(i.name)||!text(i.unit)||!positive(i.quantity)||!money(i.unitPrice)||
          !money(i.quantity*i.unitPrice)||(i.lineTotal!==undefined&&i.lineTotal!==i.quantity*i.unitPrice))||
          sum(r.items.map(i=>i.quantity*i.unitPrice))!==r.costConfirmed){invalid=true;continue;}
      }
      if(r.type==="laundry"&&((r.weightConfirmed!=null&&(!Number.isFinite(r.weightConfirmed)||r.weightConfirmed<0))||
        (r.unitPriceConfirmed!=null&&!money(r.unitPriceConfirmed)))){invalid=true;continue;}
      if(r.type==="transport"&&((r.distanceConfirmed!=null&&(!Number.isFinite(r.distanceConfirmed)||r.distanceConfirmed<0))||
        (r.unitPriceConfirmed!=null&&!money(r.unitPriceConfirmed)))){invalid=true;continue;}
      charged.push(clone(r));
    }
    if(invalid)errors.push("Chưa đủ dữ liệu chi phí dịch vụ đã xác nhận.");
    const total=invalid?null:sum(charged.map(r=>r.costConfirmed));
    if(total===null&&!invalid)errors.push("Tổng dịch vụ không hợp lệ.");
    return {charged,pending,total};
  }
  function paymentFacts(transactions,aggregate,reference,errors,complete=false){
    const rows=[],seen=new Map();let invalid=false,refund=false;
    if(!Array.isArray(transactions)){errors.push("Chưa đủ dữ liệu giao dịch.");return {rows,confirmed:null};}
    for(const t of transactions){
      if(!object(t)||t.bookingReference!==reference||!text(t.id)||!text(t.label)||!text(t.method)||!money(t.amount)||
        !["PAYMENT","REFUND"].includes(t.kind)||!["CONFIRMED","PENDING_REVIEW","FAILED","CANCELLED"].includes(t.status)||
        (t.occurredAt!=null&&(typeof t.occurredAt!=="string"||!Number.isFinite(Date.parse(t.occurredAt))))){invalid=true;continue;}
      if(seen.has(t.id)){if(JSON.stringify(seen.get(t.id))!==JSON.stringify(t))invalid=true;continue;}
      seen.set(t.id,t);rows.push(clone(t));if(t.kind==="REFUND")refund=true;
    }
    if(invalid)errors.push("Chưa đủ dữ liệu thanh toán hợp lệ.");
    // There is no shared refund accounting model in this project yet. Preserve
    // the transaction for viewing; never invent netting/automatic refund rules.
    if(refund)errors.push("Có giao dịch hoàn tiền cần đối chiếu với khách sạn.");
    const received=sum(rows.filter(t=>t.kind==="PAYMENT"&&t.status==="CONFIRMED").map(t=>t.amount));
    if(aggregate!=null&&!money(aggregate)){errors.push("Số tiền đã xác nhận không hợp lệ.");invalid=true;}
    if(rows.length&&aggregate!=null&&received!==aggregate){errors.push("Tổng thanh toán và giao dịch chưa khớp. Vui lòng liên hệ khách sạn để đối chiếu.");invalid=true;}
    let confirmed=rows.length||complete?received:aggregate??null;
    if(invalid||refund)confirmed=null;
    if(confirmed===null&&!invalid&&!refund)errors.push("Chưa đủ thông tin về khoản thanh toán đã xác nhận.");
    return {rows,confirmed};
  }
  function load(reference){
    const saved=bookings.load(),booking=saved.bookings.find(b=>b.reference===reference)||null;
    if(!booking)return {booking:null,available:false,message:reference?"Không tìm thấy booking. Vui lòng chọn lại từ danh sách.":"Vui lòng chọn booking để xem hóa đơn lưu trú."};
    const stored=snapshots(),snapshot=stored.invoices.find(i=>i.bookingReference===reference);
    if(!snapshot&&!["CHECKED_IN","CHECKED_OUT"].includes(booking.bookingStatus))return {booking,available:false,message:stored.error||"Chưa có hóa đơn lưu trú cho booking này"};
    const errors=[];if(saved.error)errors.push("Không thể đọc đầy đủ dữ liệu booking. Vui lòng thử lại.");if(stored.error)errors.push(stored.error);
    const finalized=Boolean(snapshot),stay=finalized?snapshot.stay:booking.stay;
    if(!validStay(stay))return {booking,available:false,message:"Chưa đủ thông tin lưu trú để hiển thị hóa đơn."};
    const n=window.RoomStay.nights(stay.checkIn,stay.checkOut),roomName=finalized?snapshot.room.name:window.HotelRooms.find(stay.roomType)?.name||"Loại phòng";
    // Supplied sample booking totals are historical fixtures. Never reprice a
    // past stay using HotelRooms.price. Legacy simulated records lack a price
    // snapshot: their computed roomAmount is NOT accepted as an invoice quote.
    const room=finalized?clone(snapshot.room):{name:roomName,amount:booking.source==="sample"?booking.roomAmount:booking.pricing?.roomAmount,
      unitPrice:booking.source==="sample"?booking.roomUnitPrice:booking.pricing?.unitPrice};
    if(!money(room.amount)){room.amount=null;errors.push("Chưa đủ dữ liệu tiền phòng đã lưu.");}
    if(room.unitPrice!=null&&!money(room.unitPrice)){room.unitPrice=null;errors.push("Đơn giá phòng đã lưu không hợp lệ.");}
    room.unitPrice??=null;
    const facts=finalized?null:extras.forBooking(reference,booking);
    if(facts?.error)errors.push("Không thể đọc đầy đủ yêu cầu dịch vụ. Vui lòng thử lại.");
    const service=serviceFacts(finalized?snapshot.services:facts.requests,reference,errors,finalized);
    if(facts?.error)service.total=null;
    // Empty recorded lines mean no recorded fee/discount, not a tax/price policy.
    const surcharges=finalized?snapshot.surcharges:booking.surcharges===undefined?[]:booking.surcharges,discounts=finalized?snapshot.discounts:booking.discounts===undefined?[]:booking.discounts;
    const surchargeTotal=feeLines(surcharges,"phụ phí",errors),discountTotal=feeLines(discounts,"giảm giá",errors);
    const payment=paymentFacts(finalized?snapshot.transactions:facts.payments,finalized?snapshot.confirmedAmount:booking.confirmedAmount,reference,errors,finalized||Array.isArray(booking.transactions));
    let total=[room.amount,service.total,surchargeTotal,discountTotal].every(v=>v!==null)?room.amount+service.total+surchargeTotal-discountTotal:null;
    if(total!==null&&!money(total)){errors.push("Tổng chi phí không hợp lệ.");total=null;}
    if(saved.error||stored.error)total=null;
    const balance=total!==null&&payment.confirmed!==null?total-payment.confirmed:null;
    const displayLines=lines=>Array.isArray(lines)?lines.filter(i=>object(i)&&text(i.label)&&money(i.amount)):[];
    return {booking,available:true,finalized,stay,nights:n,room,service,payment,surcharges:displayLines(surcharges),discounts:displayLines(discounts),surchargeTotal,discountTotal,total,balance,
      errors:[...new Set(errors)],paymentLabel:payment.confirmed===null||total===null?"Chưa đủ thông tin":payment.confirmed===0&&total>0?"Chưa thanh toán":payment.confirmed>=total?"Đã thanh toán đủ":"Đã thanh toán một phần"};
  }
  window.BillingData=Object.freeze({key,version,load});
})();
