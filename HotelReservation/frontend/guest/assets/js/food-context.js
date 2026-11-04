"use strict";
(() => {
  const data=window.BookingData,page=document.querySelector(".food-page");
  if(!data||!page)return;
  let state;
  function url(file){
    const params=new URLSearchParams(window.location.search),out=new URL(file,window.location.href);
    for(const key of ["reference","filter","category","page"])if(params.has(key))out.searchParams.set(key,params.get(key));
    return out;
  }
  function refresh(){
    const params=new URLSearchParams(window.location.search),reference=params.get("reference"),saved=data.load();
    const booking=saved.bookings.find(b=>b.reference===reference),eligible=booking?.bookingStatus==="CHECKED_IN"&&!saved.error;
    state={reference,booking,eligible,error:saved.error};
    const back=document.querySelector(".food-back");
    back.href=url(page.dataset.foodView==="cart"?"food-menu.html":"services.html").href;
    const identity=document.querySelector(".food-booking"),message=document.getElementById("food-booking-message"),help=document.getElementById("food-booking-help");
    identity.hidden=!booking;message.hidden=Boolean(eligible);help.hidden=Boolean(eligible);
    message.textContent=saved.error?"Không thể đọc đầy đủ booking. Vui lòng thử lại.":reference!==null&&!booking?"Không tìm thấy booking. Vui lòng chọn lại từ Booking của tôi.":"Bạn cần chọn booking đang lưu trú trước khi đặt món.";
    help.textContent=reference!==null&&!booking?"Booking của tôi":"Chọn booking đang lưu trú";
    help.href=new URL(reference!==null&&!booking?"my-bookings.html":"services.html",window.location.href).href;
    if(booking){
      identity.querySelector("strong").textContent=booking.reference+" · "+window.HotelRooms.find(booking.stay.roomType).name;
      identity.querySelector(".food-booking-status").textContent=data.labels[booking.bookingStatus];
      identity.querySelector(".food-booking-guests").textContent=booking.stay.guests+" khách · "+booking.stay.roomCount+" phòng";
    }
    return state;
  }
  window.FoodBookingContext=Object.freeze({refresh,current:()=>state,url,canSelect:()=>window.FoodCart.eligible(new URLSearchParams(window.location.search).get("reference"))});
  refresh();
})();
