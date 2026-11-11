"use strict";
(() => {
  const page=document.querySelector(".review-page"),bookings=window.BookingData,reviews=window.ReviewData;
  if(!page||!bookings||!reviews||page.dataset.reviewInitialized)return;page.dataset.reviewInitialized="true";
  const group=document.getElementById("review-rating"),description=document.getElementById("rating-description"),comment=document.getElementById("review-comment"),counter=document.getElementById("review-character-count");
  const options=[...group.querySelectorAll(".review-star-option")],radios=[...group.querySelectorAll('input[name="rating"]')],starRow=group.querySelector(".review-stars");
  const content=document.querySelector(".review-content"),unavailable=document.getElementById("review-unavailable"),submit=document.getElementById("review-submit"),feedback=document.getElementById("review-feedback");
  const labels=["Rất không hài lòng","Không hài lòng","Bình thường","Hài lòng","Rất hài lòng"],pending=new Map();
  let activeReference=null,timer=null,busy=false,feedbackKind="";
  const selected=()=>{const checked=radios.find(r=>r.checked);return checked?Number(checked.value):null;};
  function message(text,error=false,kind=""){feedback.textContent=text||"";feedback.hidden=!text;feedback.dataset.error=String(error);feedbackKind=kind;}
  function fieldError(key,text=""){
    const error=document.getElementById(key==="rating"?"rating-error":"comment-error"),field=key==="rating"?group:comment;
    error.textContent=text;error.hidden=!text;field.setAttribute("aria-invalid",String(Boolean(text)));
  }
  function highlight(value){options.forEach((option,index)=>{const active=index<value;option.dataset.highlighted=String(active);option.querySelector(".review-star").textContent=active?"★":"☆";});}
  function showSelection(){const value=selected();highlight(value||0);description.textContent=Number.isInteger(value)&&value>=1&&value<=5?labels[value-1]:"Chọn mức độ hài lòng của bạn.";}
  function updateCounter(){counter.textContent=comment.value.length.toLocaleString("vi-VN")+"/1.000";}
  function flush(reference=activeReference){
    window.clearTimeout(timer);timer=null;const draft=pending.get(reference);if(!draft)return true;
    const result=reviews.saveDraft(reference,draft.rating,draft.comment);
    if(result.error){message(result.error,true,"storage");return false;}
    pending.delete(reference);if(feedbackKind==="storage")message("");return true;
  }
  function changed(){
    if(!activeReference||submit.disabled)return;
    pending.set(activeReference,{rating:selected(),comment:comment.value});
    window.clearTimeout(timer);const reference=activeReference;timer=window.setTimeout(()=>flush(reference),250);
    const errors=reviews.errors(selected(),comment.value);
    if(group.getAttribute("aria-invalid")==="true")fieldError("rating",errors.rating);
    if(comment.getAttribute("aria-invalid")==="true"||comment.value.length>1000)fieldError("comment",errors.comment);
  }
  function sent(review,announce=false){
    pending.delete(review.bookingReference);window.clearTimeout(timer);
    document.querySelector(".review-fields").hidden=true;document.querySelector(".review-editor > .review-actions").hidden=true;
    document.getElementById("review-sent").hidden=false;document.getElementById("experience-title").textContent="Đánh giá của bạn";
    const stars=document.getElementById("review-sent-stars");stars.textContent="★".repeat(review.rating)+"☆".repeat(5-review.rating);stars.setAttribute("aria-label",review.rating+" sao — "+labels[review.rating-1]);
    document.getElementById("review-sent-description").textContent=labels[review.rating-1];
    const text=document.getElementById("review-sent-comment");text.textContent=review.comment;text.hidden=!review.comment.trim();
    const time=document.getElementById("review-sent-at");time.dateTime=review.submittedAt;time.textContent=new Date(review.submittedAt).toLocaleString("vi-VN",{timeZone:"Asia/Bangkok"});
    submit.disabled=true;if(announce)message("");
  }
  function render(){
    const params=new URLSearchParams(window.location.search),reference=params.get("reference"),filter=bookings.normalizeFilter(params.get("filter"));
    if(activeReference!==reference&&pending.has(activeReference))flush(activeReference);
    activeReference=reference;const saved=bookings.load(),booking=saved.bookings.find(b=>b.reference===reference),eligible=booking?.bookingStatus==="CHECKED_OUT";
    const returnURL=booking?bookings.entryURL("booking-detail.html",booking,window.location.href,filter):bookings.listURL(window.location.href,filter);
    document.querySelectorAll("[data-review-return]").forEach(link=>{link.href=returnURL.href;});
    const back=document.querySelector(".review-heading .review-back");back.textContent=booking?"← Về chi tiết booking":"← Về booking của tôi";
    unavailable.querySelector("a").href=bookings.listURL(window.location.href,filter).href;
    content.hidden=!eligible;unavailable.hidden=Boolean(eligible);
    if(!eligible){submit.disabled=true;unavailable.querySelector("p").textContent=!reference?"Vui lòng chọn booking để đánh giá kỳ lưu trú.":!booking?"Không tìm thấy booking.":"Bạn chỉ có thể đánh giá sau khi hoàn tất kỳ lưu trú.";return;}
    const stay=booking.stay,room=window.HotelRooms.find(stay.roomType);document.querySelector(".review-room-name h3").textContent=room.name;
    const image=document.querySelector(".review-room-image img");image.src=room.image;image.alt="Không gian phòng nghỉ minh họa cho loại "+room.name;
    const values=[booking.reference,stay.checkIn.split("-").reverse().join("/"),stay.checkOut.split("-").reverse().join("/"),window.RoomStay.nights(stay.checkIn,stay.checkOut)+" đêm",stay.guests+" khách",stay.roomCount+" phòng"];
    document.querySelectorAll(".review-stay-facts dd").forEach((dd,i)=>{if(i<values.length)dd.textContent=values[i];});document.querySelector(".review-booking-status").textContent=bookings.labels[booking.bookingStatus];
    const stored=reviews.load(reference);
    if(stored.review){sent(stored.review);if(stored.error||saved.error)message("Không thể đọc đầy đủ dữ liệu đã lưu. Vui lòng thử lại.",true,"storage");return;}
    document.getElementById("experience-title").textContent="Trải nghiệm của bạn thế nào?";document.querySelector(".review-fields").hidden=false;document.querySelector(".review-editor > .review-actions").hidden=false;document.getElementById("review-sent").hidden=true;submit.disabled=false;
    const draft=pending.get(reference)||stored.draft||{rating:null,comment:""};radios.forEach(r=>{r.checked=Number(r.value)===draft.rating;});comment.value=draft.comment;showSelection();updateCounter();
    fieldError("rating");fieldError("comment");
    if(stored.error||saved.error)message("Không thể đọc đầy đủ dữ liệu đã lưu. Nội dung đang nhập được giữ trên trang; vui lòng thử lại.",true,"storage");else if(feedbackKind==="storage")message("");
  }
  options.forEach((option,index)=>option.addEventListener("pointerenter",()=>highlight(index+1)));
  radios.forEach(radio=>{radio.addEventListener("focus",()=>highlight(Number(radio.value)));radio.addEventListener("change",()=>{showSelection();changed();});});
  starRow.addEventListener("pointerleave",()=>highlight(selected()||0));starRow.addEventListener("pointercancel",()=>highlight(selected()||0));
  group.addEventListener("focusout",event=>{if(!group.contains(event.relatedTarget))highlight(selected()||0);});
  comment.addEventListener("input",()=>{updateCounter();changed();});
  document.querySelectorAll("[data-review-return]").forEach(link=>link.addEventListener("click",event=>{if(!flush()){event.preventDefault();feedback.focus?.({preventScroll:true});}}));
  submit.addEventListener("click",()=>{
    if(busy||submit.disabled)return;
    const rating=selected(),text=comment.value,invalid=reviews.errors(rating,text);fieldError("rating",invalid.rating);fieldError("comment",invalid.comment);
    if(Object.keys(invalid).length){const first=invalid.rating?group:comment;first.scrollIntoView({block:"nearest",behavior:"auto"});first.focus({preventScroll:true});return;}
    window.clearTimeout(timer);pending.set(activeReference,{rating,comment:text});busy=true;submit.disabled=true;
    const result=reviews.submit(activeReference,rating,text);busy=false;
    if(result.error||result.errors){submit.disabled=false;message(result.error||"Vui lòng kiểm tra nội dung đánh giá.",true,"storage");return;}
    sent(result.review,true);
  });
  window.addEventListener("pagehide",()=>{for(const ref of [...pending.keys()])flush(ref);});
  window.addEventListener("pageshow",render);window.addEventListener("popstate",render);render();
})();
