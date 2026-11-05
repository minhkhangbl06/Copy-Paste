"use strict";
(() => {
  const bookings=window.BookingData;if(!bookings)return;
  const session=window.GuestSession,initialOwner=session?.owner()||null;
  // A pagehide/debounce callback from an old document must not restore a draft
  // after logout or bind it to a different Guest's newly created workspace.
  const sameOwner=()=>{if(!session)return true;const current=session.load();return !current.error&&(current.guest?.id||null)===initialOwner;};
  const key="copyPasteHotel.reviews",version=1;
  const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
  const referenceValid=v=>typeof v==="string"&&/^(CP-B\d{3}|DEMO-[A-Z0-9-]{8,80})$/.test(v);
  const ratingValid=v=>Number.isInteger(v)&&v>=1&&v<=5;
  const timestamp=v=>typeof v==="string"&&Number.isFinite(Date.parse(v));
  const commentValid=v=>typeof v==="string"&&v.length<=1000;
  const clone=v=>JSON.parse(JSON.stringify(v));
  function errors(rating,comment){
    const errors={};if(!ratingValid(rating))errors.rating=rating===null||rating===0?"Vui lòng chọn mức độ hài lòng.":"Mức đánh giá phải là số nguyên từ 1 đến 5 sao.";
    if(!commentValid(comment))errors.comment="Nhận xét không được vượt quá 1.000 ký tự.";return errors;
  }
  function read(){
    if(!sameOwner())return {reviews:{},drafts:{},error:"session-changed"};
    let raw;try{raw=window.sessionStorage.getItem(key);}catch{return {reviews:{},drafts:{},error:"unavailable"};}
    if(raw===null)return {reviews:{},drafts:{},error:null};
    try{
      const data=JSON.parse(raw);if(data.version!==version||!object(data.reviews)||!object(data.drafts))throw Error();
      const reviews={},drafts={},ids=new Set();let error=null;
      for(const[ref,r]of Object.entries(data.reviews)){
        if(!referenceValid(ref)||!object(r)||r.bookingReference!==ref||typeof r.id!=="string"||!/^DEMO-RV-[A-F0-9]{32}$/.test(r.id)||ids.has(r.id)||
          !ratingValid(r.rating)||!commentValid(r.comment)||!timestamp(r.submittedAt)){error="invalid";continue;}
        ids.add(r.id);reviews[ref]=clone(r);
      }
      for(const[ref,d]of Object.entries(data.drafts)){
        if(!referenceValid(ref)||!object(d)||(d.rating!==null&&!ratingValid(d.rating))||!commentValid(d.comment)||!timestamp(d.updatedAt)){error="invalid";continue;}
        if(!reviews[ref])drafts[ref]=clone(d);
      }
      return {reviews,drafts,error};
    }catch{return {reviews:{},drafts:{},error:"invalid"};}
  }
  function load(reference){const saved=read();return {review:referenceValid(reference)?saved.reviews[reference]||null:null,draft:referenceValid(reference)?saved.drafts[reference]||null:null,error:saved.error};}
  function eligible(reference){const saved=bookings.load();return !saved.error&&saved.bookings.some(b=>b.reference===reference&&b.bookingStatus==="CHECKED_OUT");}
  function persist(data){
    try{const raw=JSON.stringify({version,reviews:data.reviews,drafts:data.drafts});window.sessionStorage.setItem(key,raw);return window.sessionStorage.getItem(key)===raw;}catch{return false;}
  }
  function saveDraft(reference,rating,comment){
    if(!referenceValid(reference))return {error:"Mã booking không hợp lệ."};
    const saved=read();if(saved.error)return {error:"Chưa lưu được bản nháp đánh giá. Vui lòng thử lại."};
    if(saved.reviews[reference])return {review:saved.reviews[reference],error:null};
    if(!referenceValid(reference)||!eligible(reference))return {error:"Chỉ có thể đánh giá booking đã hoàn tất."};
    if((rating!==null&&!ratingValid(rating))||!commentValid(comment))return {error:"Bản nháp chưa hợp lệ; nhận xét tối đa 1.000 ký tự."};
    const prior=saved.drafts[reference];
    if((prior?.rating??null)===rating&&(prior?.comment??"")===comment)return {error:null};
    const drafts={...saved.drafts};if(rating===null&&comment==="")delete drafts[reference];
    else drafts[reference]={rating,comment,updatedAt:new Date().toISOString()};
    return persist({...saved,drafts})?{error:null}:{error:"Chưa lưu được bản nháp đánh giá. Vui lòng thử lại."};
  }
  function submit(reference,rating,comment){
    const saved=read();if(saved.error)return {error:"Chưa lưu được đánh giá. Vui lòng thử lại."};
    // Re-read the booking on every submission. Session checks are not ownership
    // or authorization. M3/M5 must enforce completion and one-review rules server-side.
    if(!referenceValid(reference)||!eligible(reference))return {error:"Chỉ có thể đánh giá booking đã hoàn tất."};
    if(saved.reviews[reference])return {review:saved.reviews[reference],existing:true,error:null};
    const invalid=errors(rating,comment);if(Object.keys(invalid).length)return {errors:invalid};
    try{
      const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
      const review={id:"DEMO-RV-"+[...bytes].map(n=>n.toString(16).padStart(2,"0")).join("").toUpperCase(),bookingReference:reference,rating,comment,submittedAt:new Date().toISOString()};
      const drafts={...saved.drafts};delete drafts[reference];
      // Single verified write both inserts the immutable review and removes only
      // its draft. A retry after an uncertain readback finds the same booking key.
      if(!persist({reviews:{...saved.reviews,[reference]:review},drafts}))throw Error();
      return {review,error:null};
    }catch{return {error:"Chưa lưu được đánh giá. Vui lòng thử lại."};}
  }
  // Frontend-only session adapter. No public publication, account flag, API or database.
  window.ReviewData=Object.freeze({key,version,read,load,errors,saveDraft,submit});
})();
