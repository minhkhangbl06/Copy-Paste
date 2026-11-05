"use strict";
(() => {
  const page=document.querySelector(".services-page"),data=window.BookingData;
  if(!page||!data||page.dataset.contextInitialized)return;
  page.dataset.contextInitialized="true";
  const picker=document.getElementById("services-booking"),listeners=[];
  let state={booking:null,eligible:false,error:null,reference:null};
  function refresh(autoSelect=false){
    const params=new URLSearchParams(window.location.search),saved=data.load();
    let reference=params.has("reference")?params.get("reference"):null;
    const active=saved.bookings.filter(b=>b.bookingStatus==="CHECKED_IN");
    if(reference===null&&autoSelect&&active.length===1){
      reference=active[0].reference;const url=new URL(window.location.href);url.searchParams.set("reference",reference);window.history.replaceState(null,"",url);
    }
    const booking=reference!==null?saved.bookings.find(b=>b.reference===reference)||null:null;
    const eligible=booking?.bookingStatus==="CHECKED_IN",changed=state.reference!==reference;
    const filter=data.normalizeFilter(params.get("filter"));
    state={booking,eligible,canRequest:eligible&&!saved.error,error:saved.error,reference,filter,requestedService:params.get("service")};
    page.dataset.bookingEligible=String(eligible);page.dataset.bookingReference=reference||"";
    document.querySelector(".services-content").hidden=false;
    picker.replaceChildren();const empty=document.createElement("option");empty.value="";empty.textContent="Chọn booking đang lưu trú";picker.append(empty);
    const options=[...active];if(booking&&!options.some(b=>b.reference===booking.reference))options.push(booking);
    options.forEach(b=>{const option=document.createElement("option");option.value=b.reference;option.textContent=b.reference+" · "+window.HotelRooms.find(b.stay.roomType).name+" · "+data.labels[b.bookingStatus];picker.append(option);});
    picker.value=booking?booking.reference:"";document.getElementById("services-booking-picker").hidden=!options.length;
    const message=document.getElementById("services-context-message");
    message.hidden=Boolean(eligible&&!saved.error);
    message.querySelector("p").textContent=saved.error?"Không thể đọc đầy đủ booking đã lưu. Vui lòng thử lại.":reference!==null&&!booking?"Không tìm thấy booking. Vui lòng chọn lại từ danh sách.":booking?.bookingStatus==="CHECKED_OUT"?"Booking đã hoàn tất. Bạn có thể xem lịch sử dịch vụ.":"Bạn cần có booking đang lưu trú để yêu cầu dịch vụ.";
    message.querySelector("a").href=data.listURL(window.location.href,filter).href;
    const back=document.querySelector(".services-heading .services-back");back.href=booking?data.entryURL("booking-detail.html",booking,window.location.href,filter).href:data.listURL(window.location.href,filter).href;
    back.textContent=booking?"← Về chi tiết booking":"← Về booking của tôi";
    const stay=document.querySelector(".services-stay[aria-labelledby]");stay.hidden=!booking;
    if(booking){
      const s=booking.stay,room=window.HotelRooms.find(s.roomType),values=[booking.reference,room.name,s.guests+" khách",s.checkIn.split("-").reverse().join("/"),s.checkOut.split("-").reverse().join("/"),s.roomCount+" phòng"];
      page.querySelectorAll(".services-stay-facts dd").forEach((dd,i)=>{dd.textContent=values[i];});
      const badge=page.querySelector(".services-stay-heading .service-status");badge.textContent=data.labels[booking.bookingStatus];badge.className="service-status"+(eligible?" service-status-staying":"");
    }
    const menu=new URL("food-menu.html",window.location.href);
    if(booking)menu.search=data.entryURL("food-menu.html",booking,window.location.href,filter).search;
    document.getElementById("services-food-menu").href=menu.href;
    listeners.forEach(fn=>fn(state,{changed,initial:false}));
    return state;
  }
  picker.addEventListener("change",()=>{
    const url=new URL(window.location.href);if(picker.value)url.searchParams.set("reference",picker.value);else url.searchParams.delete("reference");
    if(url.href!==window.location.href)window.history.pushState(null,"",url);refresh(false);
  });
  window.addEventListener("popstate",()=>refresh(false));
  window.addEventListener("pageshow",()=>refresh(false));
  window.ServicesContext=Object.freeze({current:()=>state,refresh:()=>refresh(false),subscribe:fn=>{listeners.push(fn);fn(state,{changed:false,initial:true});}});
  refresh(true);
})();
