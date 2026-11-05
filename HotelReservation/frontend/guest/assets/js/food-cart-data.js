"use strict";
(() => {
  const catalog=window.FoodCatalog,requests=window.ServiceRequests,bookings=window.BookingData;
  if(!catalog||!requests||!bookings)return;
  const key="copyPasteHotel.foodCarts",version=1,clone=v=>JSON.parse(JSON.stringify(v));
  const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
  const validRef=r=>typeof r==="string"&&/^(CP-B\d{3}|DEMO-[A-Z0-9-]{8,80})$/.test(r);
  const validId=id=>typeof id==="string"&&/^DEMO-DV-[A-Z0-9-]{8,80}$/.test(id);
  const empty=()=>({items:[],note:"",catalogStamp:catalog.stamp(),submission:null,lastSubmission:null});
  function valid(c){
    return object(c)&&Array.isArray(c.items)&&new Set(c.items.map(i=>i?.foodId)).size===c.items.length&&
      c.items.every(i=>object(i)&&typeof i.foodId==="string"&&/^[a-z0-9-]{1,80}$/.test(i.foodId)&&Number.isSafeInteger(i.quantity)&&i.quantity>0)&&
      typeof c.note==="string"&&c.note.length<=1000&&typeof c.catalogStamp==="string"&&
      (c.submission===null||object(c.submission)&&validId(c.submission.id)&&c.submission.fingerprint===fingerprint(c))&&
      (c.lastSubmission===null||validId(c.lastSubmission)&&c.items.length===0&&c.note===""&&c.submission===null);
  }
  function read(){
    try{
      const raw=window.sessionStorage.getItem(key);if(raw===null)return {byBooking:{},error:null};
      const data=JSON.parse(raw);if(data.version!==version||!object(data.byBooking))throw Error();
      const byBooking={};let error=null;
      for(const[ref,c]of Object.entries(data.byBooking)){if(!validRef(ref)||!valid(c)){error="invalid";continue;}byBooking[ref]=c;}
      return {byBooking,error};
    }catch{return {byBooking:{},error:"unavailable"};}
  }
  const fingerprint=c=>JSON.stringify({items:c.items,note:c.note,catalogStamp:c.catalogStamp});
  function load(reference){
    const saved=read(),cart=clone(saved.byBooking[reference]||empty());
    const prior=cart.submission?recorded(reference,cart):{};
    return {cart,error:saved.error||prior.error,locked:Boolean(prior.request),needsReview:cart.catalogStamp!==catalog.stamp()||cart.items.some(i=>!catalog.find(i.foodId))};
  }
  function save(reference,cart,saved=read()){
    if(saved.error||!validRef(reference)||!valid(cart))return false;
    try{const raw=JSON.stringify({version,byBooking:{...saved.byBooking,[reference]:cart}});window.sessionStorage.setItem(key,raw);return window.sessionStorage.getItem(key)===raw;}catch{return false;}
  }
  function eligible(reference){const state=bookings.load();return !state.error&&state.bookings.some(b=>b.reference===reference&&b.bookingStatus==="CHECKED_IN");}
  function totals(cart){
    const items=cart.items.flatMap(i=>{const food=catalog.find(i.foodId);return food?[{...food,quantity:i.quantity,lineTotal:food.price*i.quantity}]:[];});
    const total=items.reduce((n,i)=>n+i.lineTotal,0),quantity=items.reduce((n,i)=>n+i.quantity,0);
    return {items,total,quantity,count:items.length,valid:Number.isSafeInteger(total)&&Number.isSafeInteger(quantity)};
  }
  function recorded(reference,cart){
    const result=requests.load(reference);if(result.error)return {error:"Không thể đọc yêu cầu đã lưu. Vui lòng thử lại."};
    const id=cart.submission?.id||cart.lastSubmission;
    const request=result.requests.find(r=>r.id===id);
    if(request&&request.type!=="food")return {error:"Mã lần gửi không thuộc đơn món. Vui lòng xem lại yêu cầu dịch vụ."};
    if(request&&cart.submission&&request.cartFingerprint!==cart.submission.fingerprint)return {error:"Dữ liệu lần gửi không khớp. Vui lòng xem lại yêu cầu dịch vụ."};
    return {request,error:null};
  }
  function update(reference,change,allowStale=false){
    if(!eligible(reference))return {error:"Bạn cần có booking đang lưu trú để chọn món."};
    const saved=read();if(saved.error)return {error:"Chưa lưu được giỏ món. Vui lòng thử lại."};
    const cart=clone(saved.byBooking[reference]||empty()),prior=recorded(reference,cart);
    if(prior.error)return prior;
    if(cart.submission&&prior.request)return {error:"Yêu cầu đã được ghi nhận. Mở giỏ món để hoàn tất lần gửi trước."};
    if(!allowStale&&(cart.catalogStamp!==catalog.stamp()||cart.items.some(i=>!catalog.find(i.foodId))))return {error:"Thực đơn đã thay đổi. Vui lòng mở giỏ món để xem lại."};
    const result=change(cart);if(result)return {error:result};
    cart.submission=null;cart.lastSubmission=null;
    if(!totals(cart).valid)return {error:"Số lượng món quá lớn. Vui lòng giảm số lượng."};
    return save(reference,cart,saved)?{cart,error:null}:{error:"Chưa lưu được giỏ món. Vui lòng thử lại."};
  }
  function setQuantity(reference,foodId,quantity){return update(reference,cart=>{
    if(!catalog.find(foodId)||!Number.isSafeInteger(quantity)||quantity<0)return "Số lượng món không hợp lệ.";
    const i=cart.items.findIndex(i=>i.foodId===foodId);
    if(quantity===0){if(i>=0)cart.items.splice(i,1);}else if(i>=0)cart.items[i].quantity=quantity;else cart.items.push({foodId,quantity});
  });}
  function setNote(reference,note){return update(reference,cart=>{if(typeof note!=="string"||note.length>1000)return "Ghi chú không được vượt quá 1.000 ký tự.";cart.note=note;},true);}
  function submit(reference){
    let saved=read();if(saved.error)return {error:"Chưa lưu được đơn món. Vui lòng thử lại."};
    let cart=clone(saved.byBooking[reference]||empty()),prior=recorded(reference,cart);
    if(prior.error)return prior;
    // Recover a verified earlier write before creating anything new. The token
    // is durably saved BEFORE the service request; retries use that same token.
    if(prior.request){
      if(cart.submission&&!save(reference,{...empty(),lastSubmission:prior.request.id},saved))return {error:"Yêu cầu đã được lưu nhưng chưa dọn được giỏ. Vui lòng thử lại để hoàn tất."};
      return {request:prior.request,error:null};
    }
    if(!eligible(reference))return {error:"Booking không còn đủ điều kiện đặt món."};
    if(!cart.items.length)return {error:"Giỏ món của bạn đang trống"};
    if(cart.catalogStamp!==catalog.stamp()||cart.items.some(i=>!catalog.find(i.foodId))){
      cart.items=cart.items.filter(i=>catalog.find(i.foodId));cart.catalogStamp=catalog.stamp();cart.submission=null;
      return save(reference,cart,saved)?{review:true,error:"Thực đơn hoặc giá món đã thay đổi. Vui lòng xem lại giỏ rồi xác nhận lần nữa."}:{error:"Chưa cập nhật được giỏ món. Vui lòng thử lại."};
    }
    const summary=totals(cart);if(!summary.valid)return {error:"Số lượng hoặc tổng tiền không hợp lệ."};
    const fp=fingerprint(cart);
    if(!cart.submission){cart.submission={id:requests.newId(),fingerprint:fp};if(!save(reference,cart,saved))return {error:"Chưa lưu được lần gửi. Vui lòng thử lại."};}
    if(cart.submission.fingerprint!==fp)return {error:"Giỏ đã thay đổi so với lần gửi. Vui lòng tải lại để kiểm tra."};
    const order={note:cart.note,cartFingerprint:fp,orderTotal:summary.total,items:summary.items.map(i=>({foodId:i.id,name:i.name,unit:i.unit,quantity:i.quantity,unitPrice:i.price,lineTotal:i.lineTotal}))};
    const result=requests.createFood(reference,order,cart.submission.id);if(result.error)return result;
    saved=read();if(saved.error||!save(reference,{...empty(),lastSubmission:result.request.id},saved))return {error:"Yêu cầu đã được lưu nhưng chưa dọn được giỏ. Vui lòng thử lại để hoàn tất."};
    return result;
  }
  // Frontend session adapter only, not authorization/database/payment evidence.
  // M4 must provide canonical menu prices, idempotent order creation and ownership.
  window.FoodCart=Object.freeze({key,version,load,totals,setQuantity,setNote,submit,eligible});
})();
