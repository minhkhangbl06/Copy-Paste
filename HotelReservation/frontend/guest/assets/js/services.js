"use strict";
(() => {
  const page=document.querySelector(".services-page"),context=window.ServicesContext,store=window.ServiceRequests;
  if(!page||!context||!store||page.dataset.serviceUiInitialized)return;
  page.dataset.serviceUiInitialized="true";
  const openers=[...page.querySelectorAll("[data-service-open]")],panels=[...page.querySelectorAll("[data-service-panel]")];
  const forms={laundry:document.getElementById("laundry-form"),transport:document.getElementById("transfer-form")};
  const fieldIds={laundry:{time:"service-time",note:"service-note"},transport:{pickup:"transfer-pickup",destination:"transfer-destination",date:"transfer-date",time:"transfer-time",passengers:"transfer-passengers",phone:"transfer-phone",note:"transfer-note"}};
  const panelFor={laundry:"laundry-request-panel",transport:"transfer-request-panel"};
  const feedback=document.getElementById("services-feedback"),tokens={laundry:null,transport:null},busy={laundry:false,transport:false};
  const dialog=document.getElementById("service-cancel-dialog");
  let wanted=null,cancelTarget=null,cancelOpener=null,cancelling=false,highlightScrolled=false;
  const money=n=>new Intl.NumberFormat("vi-VN").format(n)+" đ";
  const date=value=>value?new Date(value).toLocaleString("vi-VN"):"Chưa có thông tin";
  function focusVisible(element,alignToHeader=false){
    if(!element)return;element.focus({preventScroll:true});
    const bounds=element.getBoundingClientRect(),top=Math.max(0,document.getElementById("site-header")?.getBoundingClientRect().bottom||0)+16;
    if(alignToHeader||bounds.top<top||bounds.bottom>window.innerHeight-16)window.scrollBy({top:bounds.top-top,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  }
  function closeAll(){panels.forEach(p=>{p.hidden=true;});openers.forEach(b=>b.setAttribute("aria-expanded","false"));}
  function openPanel(id,align=false){
    const state=context.current(),fresh=window.BookingData.load();
    if(!state.canRequest||fresh.error||!fresh.bookings.some(b=>b.reference===state.reference&&b.bookingStatus==="CHECKED_IN"))return;
    const panel=panels.find(p=>p.id===id);if(!panel)return;
    feedback.hidden=true;
    panels.forEach(p=>{p.hidden=p!==panel;});openers.forEach(b=>b.setAttribute("aria-expanded",String(b.dataset.serviceOpen===id)));
    focusVisible(panel.querySelector("h2"),align);
  }
  function closePanel(panel,restoreFocus=true){
    if(!panel)return;panel.hidden=true;const opener=openers.find(b=>b.dataset.serviceOpen===panel.id);opener?.setAttribute("aria-expanded","false");if(restoreFocus)focusVisible(opener);
  }
  function setError(type,key,message=""){
    const field=document.getElementById(fieldIds[type][key]),error=document.getElementById(field.id+"-error");
    field.setAttribute("aria-invalid",String(Boolean(message)));error.textContent=message;error.hidden=!message;
  }
  function clearErrors(type){Object.keys(fieldIds[type]).forEach(key=>setError(type,key));document.getElementById(forms[type].id+"-error").hidden=true;}
  function syncTiming(group){
    const hidden=group.querySelector('input[type="radio"]:checked')?.value!=="scheduled",fields=document.getElementById(group.dataset.serviceTiming);
    fields.hidden=hidden;fields.querySelectorAll("input").forEach(input=>{input.disabled=hidden;if(hidden){const type=fields.id==="laundry-time-fields"?"laundry":"transport",key=input.id==="transfer-date"?"date":"time";setError(type,key);}});
  }
  function read(type){
    const values=Object.fromEntries(Object.entries(fieldIds[type]).map(([key,id])=>[key,document.getElementById(id).value]));
    values.mode=forms[type].querySelector('input[type="radio"]:checked')?.value||"";
    return values;
  }
  function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  function history(){
    const state=context.current(),list=page.querySelector(".service-requests-list"),error=document.getElementById("services-history-error");
    list.replaceChildren();const saved=state.booking?store.load(state.reference):{requests:[],error:null};
    error.hidden=!saved.error;error.textContent=saved.error?"Không thể đọc đầy đủ yêu cầu đã lưu. Vui lòng thử lại.":"";
    if(!saved.requests.length){list.append(element("p",state.booking?"Chưa có yêu cầu dịch vụ cho booking này.":"Chọn booking để xem lịch sử yêu cầu."));return;}
    for(const request of saved.requests){
      const card=element("article",undefined,"service-request"+(request.type==="transport"?" service-request-transport":request.type==="food"?" service-request-food":""));
      card.id="service-"+request.id;card.tabIndex=-1;
      const reference=element("div",undefined,"service-request-reference");reference.append(element("p","Mã yêu cầu"),element("h3",request.id));card.append(reference);
      const facts=element("dl",undefined,"service-request-facts");
      function pair(label,value){const row=element("div"),dd=element("dd");if(typeof value==="string")dd.textContent=value;else dd.append(value);row.append(element("dt",label),dd);facts.append(row);}
      pair("Dịch vụ",store.name(request.type));pair("Thời điểm tạo",date(request.createdAt));
      const badge=element("span",store.label(request),"service-status service-status-"+({PENDING:"pending",PROCESSING:"processing",CANCELLED:"cancelled",COMPLETED:"completed",CONFIRMED:"processing"})[request.status]);pair("Trạng thái",badge);
      const schedule=request.schedule;
      if(request.type==="laundry"){
        pair("Nhân viên đến lấy đồ",schedule.mode==="asap"?"Lấy đồ sớm nhất có thể":schedule.mode==="scheduled"?schedule.date.split("-").reverse().join("/")+" · "+schedule.time:"Chưa có thông tin");
        pair("Khối lượng đã cân",request.weightConfirmed===null?"Chờ cân xác nhận":request.weightConfirmed+" kg");
        if(!["COMPLETED","CANCELLED"].includes(request.status))pair("Dự kiến trả đồ sạch",request.returnExpectedAt?date(request.returnExpectedAt):"Chờ khách sạn xác nhận");
      }else if(request.type==="transport"){
        pair("Điểm đón",request.pickup);pair("Điểm đến",request.destination);pair("Số hành khách",String(request.passengers));pair("Điện thoại",request.phone||"Chưa cung cấp");
        pair("Thời điểm đưa đón",schedule.mode==="asap"?"Đi sớm nhất có thể":schedule.mode==="scheduled"?schedule.date.split("-").reverse().join("/")+" · "+schedule.time:"Chưa có thông tin");
        pair("Quãng đường",request.distanceConfirmed===null?"Chờ xác nhận":request.distanceConfirmed+" km");
      }
      pair(request.type==="transport"?"Báo giá":"Chi phí",request.status==="CANCELLED"?"Không tính vào tổng":request.costConfirmed===null?(request.type==="transport"?"Chờ báo giá":"Chờ khách sạn xác nhận"):money(request.costConfirmed));
      if(request.note)pair("Ghi chú",request.note);
      if(request.cancelledAt)pair("Thời điểm hủy",date(request.cancelledAt));
      card.append(facts);
      if(request.items){
        const food=element("div",undefined,"service-food-order"),items=element("ul",undefined,"service-food-order-items");
        const showAmounts=request.status!=="CANCELLED"&&(store.billable(request)||Number.isSafeInteger(request.orderTotal));
        if(showAmounts)food.append(element("p","Tổng tiền món: "+money(request.orderTotal??request.costConfirmed),"service-food-order-total"));
        request.items.forEach(item=>{const row=element("li");row.append(element("span",item.name+" × "+item.quantity));if(showAmounts)row.append(element("span",money(item.lineTotal??item.quantity*item.unitPrice)));items.append(row);});
        food.append(items);card.append(food);
      }
      if(store.canCancel(request)){
        const actions=element("div",undefined,"service-request-actions"),button=element("button","Hủy yêu cầu","button button-outline");
        button.type="button";button.dataset.cancelService=request.id;actions.append(button);card.append(actions);
      }
      list.append(card);
    }
  }
  function submit(type,event){
    event.preventDefault();const panel=panels.find(p=>p.id===panelFor[type]),state=context.current();
    if(busy[type]||panel.hidden)return;
    const values=read(type),checked=store.validate(state.reference,type,values),errors=checked.errors||{};
    clearErrors(type);Object.keys(fieldIds[type]).forEach(key=>setError(type,key,errors[key]));
    const general=document.getElementById(forms[type].id+"-error");general.textContent=checked.error||errors.mode||"";general.hidden=!general.textContent;
    const first=Object.keys(fieldIds[type]).find(key=>errors[key]);
    if(first){focusVisible(document.getElementById(fieldIds[type][first]));return;}if(!general.hidden)return;
    busy[type]=true;let result;
    try{tokens[type] ||= store.newId();result=store.create(state.reference,type,values,tokens[type]);}catch{result={error:"Chưa lưu được yêu cầu. Vui lòng thử lại."};}
    busy[type]=false;
    if(result.error||result.errors&&Object.keys(result.errors).length){general.textContent=result.error||"Thông tin đã thay đổi. Vui lòng kiểm tra lại.";general.hidden=false;return;}
    forms[type].reset();tokens[type]=null;clearErrors(type);page.querySelectorAll("[data-service-timing]").forEach(syncTiming);
    closePanel(panel,false);history();feedback.textContent="Đã lưu yêu cầu.";feedback.hidden=false;focusVisible(feedback);
  }
  Object.entries(forms).forEach(([type,form])=>{
    form.addEventListener("submit",event=>submit(type,event));
    form.addEventListener("input",event=>{
      const key=Object.keys(fieldIds[type]).find(k=>fieldIds[type][k]===event.target.id);
      if(key&&event.target.getAttribute("aria-invalid")==="true"){const result=store.validate(context.current().reference,type,read(type));setError(type,key,result.errors?.[key]);}
    });
  });
  page.addEventListener("click",event=>{
    const opener=event.target.closest("[data-service-open]");
    if(opener&&page.contains(opener)){wanted=opener.dataset.serviceOpen;openPanel(wanted);return;}
    const close=event.target.closest("[data-service-close]");if(close&&page.contains(close)){wanted=null;closePanel(close.closest("[data-service-panel]"));return;}
    const cancel=event.target.closest("[data-cancel-service]");if(cancel&&page.contains(cancel)){
      const state=context.current(),request=store.load(state.reference).requests.find(r=>r.id===cancel.dataset.cancelService);
      if(!request||!store.canCancel(request))return;
      cancelTarget={reference:state.reference,id:request.id};cancelOpener=cancel;document.getElementById("service-cancel-summary").textContent=request.id+" · "+store.name(request.type);
      document.getElementById("service-cancel-error").hidden=true;dialog.showModal();document.getElementById("service-cancel-back").focus({preventScroll:true});
    }
  });
  page.addEventListener("change",event=>{
    if(!event.target.matches('input[type="radio"]'))return;const group=event.target.closest("[data-service-timing]");if(group)syncTiming(group);
  });
  document.getElementById("service-cancel-back").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("cancel",event=>{event.preventDefault();dialog.close();});
  dialog.addEventListener("close",()=>{cancelTarget=null;if(cancelOpener?.isConnected)cancelOpener.focus({preventScroll:true});else focusVisible(document.getElementById("history-title"));});
  document.getElementById("service-cancel-confirm").addEventListener("click",()=>{
    if(cancelling||!cancelTarget)return;cancelling=true;const result=store.cancel(cancelTarget.reference,cancelTarget.id);cancelling=false;
    if(result.error){const error=document.getElementById("service-cancel-error");error.textContent=result.error;error.hidden=false;return;}
    history();dialog.close();feedback.textContent="Yêu cầu đã hủy.";feedback.hidden=false;
  });
  context.subscribe((state,event)=>{
    if(event.changed){Object.entries(forms).forEach(([type,form])=>{form.reset();tokens[type]=null;clearErrors(type);});closeAll();if(dialog.open)dialog.close();feedback.hidden=true;}
    if(event.initial){wanted=({laundry:panelFor.laundry,transport:panelFor.transport})[state.requestedService]||null;closeAll();}
    openers.forEach(b=>{b.disabled=!state.canRequest;});
    if(!state.canRequest)closeAll();
    page.querySelectorAll("[data-service-timing]").forEach(syncTiming);history();
    if(wanted&&state.canRequest&&(event.changed||event.initial))openPanel(wanted,true);
    {
      const id=new URLSearchParams(window.location.search).get("request");
      const request=state.booking&&store.load(state.reference).requests.find(r=>r.id===id&&r.type==="food"&&r.cartFingerprint);
      if(request){
        const card=document.getElementById("service-"+id);card.classList.add("service-request-highlight");
        card.prepend(element("p","Đã tạo yêu cầu mô phỏng; chưa gửi đến khách sạn.","service-order-notice"));
        // CSS scroll-margin reserves the sticky-header space even before its
        // asynchronous fragment finishes loading. No input receives focus.
        if(!highlightScrolled){highlightScrolled=true;card.focus({preventScroll:true});card.scrollIntoView({block:"start",behavior:"auto"});}
      }
    }
  });
})();
