"use strict";
(() => {
  const bookings=window.BookingData,dates=window.RoomSearchValidation,contacts=window.BookingDraft;
  if(!bookings||!dates||!contacts)return;
  const key="copyPasteHotel.serviceRequests",version=1;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const emptyFacts={createdAt:null,cancelledAt:null,note:"",schedule:{mode:null,date:null,time:null},
    weightConfirmed:null,distanceConfirmed:null,costConfirmed:null,returnExpectedAt:null};
  // UI fixtures belong only to CP-B003, whose sample stay is 10–13/11/2026.
  // Their declared states never advance automatically with the device clock.
  const samples=[
    {...emptyFacts,id:"DV-001",bookingReference:"CP-B003",type:"food",status:"COMPLETED",costConfirmed:230000,
      items:[{name:"Cơm gà",quantity:2,unit:"phần",unitPrice:80000},{name:"Nước cam",quantity:2,unit:"ly",unitPrice:35000}]},
    {...emptyFacts,id:"DV-002",bookingReference:"CP-B003",type:"laundry",status:"PROCESSING",unitPriceReference:50000,weightConfirmed:2,returnExpectedAt:"2026-11-12T17:00:00+07:00"},
    {...emptyFacts,id:"DV-004",bookingReference:"CP-B003",type:"food",status:"CANCELLED",items:[{name:"Sandwich trứng",quantity:2,unit:"phần",unitPrice:50000}]},
    {...emptyFacts,id:"DV-005",bookingReference:"CP-B003",type:"laundry",status:"PENDING",unitPriceReference:50000},
  ];
  // Removed from current seeds. Restore only a previously stored cancellation;
  // existing transport requests stay transport and finalized invoices keep snapshots.
  const legacySamples=[{...emptyFacts,id:"DV-003",bookingReference:"CP-B003",type:"transport",status:"PENDING",unitPriceReference:15000,pickup:"Sảnh khách sạn",destination:"Địa điểm theo yêu cầu của khách",passengers:4,phone:null}];
  const historicalSamples=[...samples,...legacySamples];
  const referenceValid=r=>typeof r==="string"&&/^(CP-B\d{3}|DEMO-[A-Z0-9-]{8,80})$/.test(r);
  const timeValid=t=>typeof t==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const timestamp=t=>typeof t==="string"&&Number.isFinite(Date.parse(t));
  const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
  const label=r=>r.type==="housekeeping"?({PENDING:"Chờ tiếp nhận",ACCEPTED:"Đã tiếp nhận",CLEANING:"Đang dọn",COMPLETED:"Hoàn tất",CANCELLED:"Đã hủy"})[r.status]:r.status==="PENDING"?(r.type==="transport"?"Chờ xác nhận":"Chờ tiếp nhận"):
    ({PROCESSING:"Đang xử lý",CONFIRMED:"Đã xác nhận thực hiện",COMPLETED:"Đã hoàn tất",CANCELLED:"Đã hủy"})[r.status];
  const name=type=>({food:"Ăn uống",laundry:"Giặt ủi",transport:"Đưa đón (lịch sử cũ)",housekeeping:"Dọn phòng"})[type];
  const canCancel=r=>r.status==="PENDING";
  const billable=r=>r.type!=="housekeeping"&&r.status==="COMPLETED"&&Number.isSafeInteger(r.costConfirmed)&&r.costConfirmed>=0;
  function validRequest(r,reference) {
    if(!object(r)||r.bookingReference!==reference||!/^DEMO-DV-[A-Z0-9-]{8,80}$/.test(r.id)||
      !["food","laundry","transport","housekeeping"].includes(r.type)||!(r.type==="housekeeping"?["PENDING","ACCEPTED","CLEANING","COMPLETED","CANCELLED"]:["PENDING","CANCELLED"]).includes(r.status)||
      !timestamp(r.createdAt)||typeof r.note!=="string"||r.note.length>1000||
      !object(r.schedule)||(r.type!=="food"&&!["asap","scheduled"].includes(r.schedule.mode))||
      !["weightConfirmed","distanceConfirmed","costConfirmed","returnExpectedAt"].every(k=>r[k]===null)||
      (r.status==="CANCELLED"?!timestamp(r.cancelledAt):r.cancelledAt!==null))return false;
    if(r.type==="housekeeping")return typeof r.roomId==="string"&&/^[-A-Z0-9]{1,80}$/.test(r.roomId)&&typeof r.roomNumber==="string"&&Boolean(r.roomNumber.trim())&&r.includedInRoomPrice===true&&r.billable===false&&
      (r.schedule.mode==="asap"?r.schedule.date===null&&r.schedule.time===null:Boolean(dates.parseDate(r.schedule.date))&&timeValid(r.schedule.time));
    if(r.type==="food")return r.schedule.mode===null&&r.schedule.date===null&&r.schedule.time===null&&validFood(r);
    if(r.type==="laundry")return r.unitPriceReference===50000&&Boolean(dates.parseDate(r.schedule.date))&&
      (r.schedule.mode==="asap"?r.schedule.time===null:timeValid(r.schedule.time));
    return r.unitPriceReference===15000&&typeof r.pickup==="string"&&Boolean(r.pickup.trim())&&typeof r.destination==="string"&&Boolean(r.destination.trim())&&
      Number.isSafeInteger(r.passengers)&&r.passengers>0&&!contacts.phoneError(r.phone)&&
      (r.schedule.mode==="asap"?r.schedule.date===null&&r.schedule.time===null:Boolean(dates.parseDate(r.schedule.date))&&timeValid(r.schedule.time));
  }
  function read() {
    let raw;try{raw=window.sessionStorage.getItem(key);}catch{return {byBooking:{},error:"unavailable"};}
    if(raw===null)return {byBooking:{},error:null};
    try{
      const value=JSON.parse(raw);if(value.version!==version||!object(value.byBooking))throw Error("schema");
      const byBooking={};let error=null;const seen=new Set();
      for(const [reference,bucket]of Object.entries(value.byBooking)){
        if(!referenceValid(reference)||!object(bucket)||!Array.isArray(bucket.requests)||!Array.isArray(bucket.cancelledSamples)){error="invalid";continue;}
        const requests=[],cancelledSamples=[];
        for(const r of bucket.requests){if(!validRequest(r,reference)||seen.has(r.id)){error="invalid";continue;}seen.add(r.id);requests.push(r);}
        for(const c of bucket.cancelledSamples){
          if(!object(c)||!timestamp(c.cancelledAt)||!historicalSamples.some(r=>r.bookingReference===reference&&r.id===c.id&&canCancel(r))||cancelledSamples.some(x=>x.id===c.id)){error="invalid";continue;}
          cancelledSamples.push(c);
        }
        byBooking[reference]={requests,cancelledSamples};
      }
      return {byBooking,error};
    }catch{return {byBooking:{},error:"invalid"};}
  }
  function load(reference) {
    const stored=read(),bucket=stored.byBooking[reference]||{requests:[],cancelledSamples:[]};
    const map=new Map(samples.filter(r=>r.bookingReference===reference).map(r=>[r.id,clone(r)]));
    legacySamples.filter(r=>r.bookingReference===reference&&bucket.cancelledSamples.some(c=>c.id===r.id)).forEach(r=>map.set(r.id,clone(r)));
    bucket.requests.forEach(r=>map.set(r.id,clone(r)));
    bucket.cancelledSamples.forEach(c=>{const r=map.get(c.id);if(r){r.status="CANCELLED";r.cancelledAt=c.cancelledAt;}});
    return {requests:[...map.values()],error:stored.error};
  }
  function persist(byBooking) {
    try{const text=JSON.stringify({version,byBooking});window.sessionStorage.setItem(key,text);return window.sessionStorage.getItem(key)===text;}
    catch{return false;}
  }
  function payload(type,v,now) {
    const mode=v.mode;
    return {type,note:typeof v.note==="string"?v.note:"",
      schedule:{mode,date:type==="laundry"?dates.dateKey(now):(mode==="scheduled"?v.date:null),time:mode==="scheduled"?v.time:null},
      ...(type==="housekeeping"?{roomId:typeof v.roomId==="string"?v.roomId:""}:{})};
  }
  function localMoment(date,time) {
    if(!dates.parseDate(date)||!timeValid(time))return null;
    const moment=dates.parseDate(date),[hours,minutes]=time.split(":").map(Number);moment.setHours(hours,minutes,0,0);
    return moment.getHours()===hours&&moment.getMinutes()===minutes?moment:null;
  }
  function validate(reference,type,v,now=new Date()) {
    const saved=bookings.load(),booking=saved.bookings.find(b=>b.reference===reference),errors={};
    if(saved.error)return {error:"Không thể đọc đầy đủ booking. Vui lòng thử lại.",errors};
    if(!booking||booking.bookingStatus!=="CHECKED_IN")return {error:"Bạn cần có booking đang lưu trú để yêu cầu dịch vụ.",errors};
    const today=dates.dateKey(now),s=booking.stay;
    if(today<s.checkIn||today>s.checkOut)return {error:"Ngày yêu cầu cần nằm trong thời gian lưu trú. Vui lòng liên hệ khách sạn để xác nhận.",errors};
    if(!["laundry","housekeeping"].includes(type))return {error:"Dịch vụ không hợp lệ.",errors};
    if(!["asap","scheduled"].includes(v.mode))errors.mode="Vui lòng chọn thời điểm sử dụng dịch vụ.";
    if(v.note!==undefined&&(typeof v.note!=="string"||v.note.length>1000))errors.note="Ghi chú không được vượt quá 1.000 ký tự.";
    if(type==="housekeeping"){
      const rooms=bookings.assignedRooms(booking);
      if(!rooms.length)return {error:"Chưa có thông tin phòng được bố trí. Vui lòng liên hệ lễ tân.",errors};
      if(!rooms.some(r=>r.id===v.roomId))errors.roomId="Vui lòng chọn phòng đã được bố trí cho booking này.";
      if(v.mode==="scheduled"){
        if(!v.date)errors.date="Vui lòng chọn ngày dọn phòng.";
        else if(!dates.parseDate(v.date))errors.date="Ngày dọn phòng không hợp lệ.";
        else if(v.date===s.checkOut)errors.date="Vui lòng liên hệ lễ tân để dọn phòng trong ngày trả phòng.";
        else if(v.date<s.checkIn||v.date>s.checkOut)errors.date="Ngày dọn phòng cần nằm trong kỳ lưu trú.";
      }
    }
    if(v.mode==="scheduled"){
      if(!v.time)errors.time=type==="laundry"?"Vui lòng chọn giờ nhân viên đến lấy đồ.":"Vui lòng chọn giờ dọn phòng.";
      else if(!timeValid(v.time))errors.time="Giờ không hợp lệ.";
      else{
        const moment=localMoment(type==="laundry"?today:v.date,v.time);
        if(moment&&(type==="laundry"?moment<now:moment<=now))errors.time=type==="laundry"?"Giờ đến lấy đồ không được trước thời điểm gửi yêu cầu.":"Thời điểm dọn phòng phải ở tương lai.";
        else if(!moment&&!errors.date)errors.time="Thời điểm đã chọn không hợp lệ.";
      }
    }
    if(type==="housekeeping"&&v.mode==="asap"&&today===s.checkOut)return {error:"Vui lòng liên hệ lễ tân để dọn phòng trong ngày trả phòng.",errors};
    // Calendar bounds do not imply every hour of checkout day is permitted.
    // M4 must enforce hotel timezone, actual checkout/service hours and ownership.
    return {errors,error:null};
  }
  function newId() {
    const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
    return "DEMO-DV-"+[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
  }
  function validFood(order){
    return typeof order.cartFingerprint==="string"&&Array.isArray(order.items)&&order.items.length>0&&
      new Set(order.items.map(i=>i?.foodId)).size===order.items.length&&order.items.every(i=>object(i)&&
        typeof i.foodId==="string"&&/^[a-z0-9-]{1,80}$/.test(i.foodId)&&typeof i.name==="string"&&Boolean(i.name.trim())&&
        typeof i.unit==="string"&&Boolean(i.unit.trim())&&Number.isSafeInteger(i.quantity)&&i.quantity>0&&
        Number.isSafeInteger(i.unitPrice)&&i.unitPrice>=0&&Number.isSafeInteger(i.lineTotal)&&i.lineTotal===i.unitPrice*i.quantity)&&
      Number.isSafeInteger(order.orderTotal)&&order.orderTotal===order.items.reduce((n,i)=>n+i.lineTotal,0);
  }
  function createFood(reference,order,id){
    const saved=read();if(saved.error)return {error:"Chưa lưu được yêu cầu món ăn. Vui lòng thử lại."};
    if(!/^DEMO-DV-[A-Z0-9-]{8,80}$/.test(id)||!object(order)||!validFood(order)||typeof order.note!=="string"||order.note.length>1000)return {error:"Dữ liệu đơn món không hợp lệ."};
    const bucket=saved.byBooking[reference]||{requests:[],cancelledSamples:[]},existing=bucket.requests.find(r=>r.id===id);
    if(existing)return existing.type==="food"&&existing.cartFingerprint===order.cartFingerprint?
      {request:clone(existing),error:null}:{error:"Lần gửi này không khớp yêu cầu đã lưu."};
    const current=bookings.load();if(current.error||!current.bookings.some(b=>b.reference===reference&&b.bookingStatus==="CHECKED_IN"))return {error:"Booking không còn đủ điều kiện đặt món."};
    if(Object.values(saved.byBooking).some(b=>b.requests.some(r=>r.id===id)))return {error:"Mã yêu cầu đã được sử dụng."};
    const request={...clone(emptyFacts),id,bookingReference:reference,type:"food",status:"PENDING",createdAt:new Date().toISOString(),
      note:order.note,items:clone(order.items),orderTotal:order.orderTotal,cartFingerprint:order.cartFingerprint};
    if(!validRequest(request,reference))return {error:"Dữ liệu đơn món không hợp lệ."};
    return persist({...saved.byBooking,[reference]:{...bucket,requests:[...bucket.requests,request]}})?
      {request:clone(request),error:null}:{error:"Chưa xác minh được việc lưu yêu cầu. Vui lòng thử lại."};
  }
  function create(reference,type,v,id) {
    const now=new Date(),stored=read();if(stored.error)return {error:"Chưa lưu được yêu cầu. Vui lòng thử lại."};
    if(typeof id!=="string"||!/^DEMO-DV-[A-Z0-9-]{8,80}$/.test(id))return {error:"Mã yêu cầu không hợp lệ."};
    const data=payload(type,v,now),bucket=stored.byBooking[reference]||{requests:[],cancelledSamples:[]},existing=bucket.requests.find(r=>r.id===id);
    if(existing){
      const prior={type:existing.type,note:existing.note,schedule:existing.schedule,...(type==="housekeeping"?{roomId:existing.roomId}:{})};
      return existing.status==="PENDING"&&JSON.stringify(prior)===JSON.stringify(data)?{request:clone(existing),error:null}:{error:"Yêu cầu này đã thay đổi. Vui lòng kiểm tra lại lịch sử."};
    }
    const checked=validate(reference,type,v,now);if(checked.error||Object.keys(checked.errors).length)return checked;
    if(type==="housekeeping"){
      const active=load(reference).requests.find(r=>r.type==="housekeeping"&&r.roomId===v.roomId&&["PENDING","ACCEPTED","CLEANING"].includes(r.status));
      if(active)return {request:active,duplicate:true,error:null};
    }
    if(Object.values(stored.byBooking).some(b=>b.requests.some(r=>r.id===id)))return {error:"Mã yêu cầu đã được sử dụng."};
    const room=type==="housekeeping"?bookings.assignedRooms(bookings.load().bookings.find(b=>b.reference===reference)).find(r=>r.id===v.roomId):null;
    const request={id,bookingReference:reference,...data,status:"PENDING",createdAt:now.toISOString(),cancelledAt:null,
      ...(type==="housekeeping"?{roomNumber:room.number,includedInRoomPrice:true,billable:false}:{unitPriceReference:50000}),
      weightConfirmed:null,distanceConfirmed:null,costConfirmed:null,returnExpectedAt:null};
    if(!validRequest(request,reference))return {error:"Thông tin yêu cầu không hợp lệ."};
    const next={...stored.byBooking,[reference]:{...bucket,requests:[...bucket.requests,request]}};
    return persist(next)?{request:clone(request),error:null}:{error:"Chưa lưu được yêu cầu. Vui lòng thử lại."};
  }
  function cancel(reference,id) {
    // M4 must recheck the authenticated owner and latest cancellable state
    // atomically; this session adapter does not grant real cancellation rights.
    const bookingState=bookings.load();if(bookingState.error||!bookingState.bookings.some(b=>b.reference===reference))return {error:"Không thể xác minh booking. Vui lòng thử lại."};
    const stored=read();if(stored.error)return {error:"Chưa lưu được thay đổi. Vui lòng thử lại."};
    const request=load(reference).requests.find(r=>r.id===id);if(!request||!canCancel(request))return {error:"Yêu cầu hiện không thể hủy trực tiếp."};
    const at=new Date().toISOString(),bucket=stored.byBooking[reference]||{requests:[],cancelledSamples:[]};
    const sample=historicalSamples.some(r=>r.bookingReference===reference&&r.id===id);
    const updated=sample?{...bucket,cancelledSamples:[...bucket.cancelledSamples,{id,cancelledAt:at}]}:
      {...bucket,requests:bucket.requests.map(r=>r.id===id?{...r,status:"CANCELLED",cancelledAt:at}:r)};
    return persist({...stored.byBooking,[reference]:updated})?{error:null}:{error:"Chưa lưu được thay đổi. Vui lòng thử lại."};
  }
  // Ordinary in-stay housekeeping is included in room price. No physical room status
  // is changed. M2 checkout jobs are separate; M4/M5 must recheck ownership/state.
  // Per-booking session fixtures only. New requests never acquire confirmed price,
  // weight, distance or staff states. Replace this adapter with M4 APIs/transactions.
  window.ServiceRequests=Object.freeze({key,version,load,validate,create,createFood,cancel,newId,label,name,canCancel,billable});
})();
