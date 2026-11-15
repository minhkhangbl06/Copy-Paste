"use strict";
(() => {
  const list=document.querySelector(".food-cart-items"),cart=window.FoodCart,context=window.FoodBookingContext,ui=window.FoodUI;
  if(!list||!cart||!context||list.dataset.initialized)return;list.dataset.initialized="true";
  const main=document.querySelector(".food-cart-main"),summary=document.querySelector(".food-summary"),empty=document.getElementById("food-empty"),note=document.getElementById("food-note"),submit=document.getElementById("food-submit");
  let busy=false,noteDirty=false;
  function render(){
    const state=context.refresh(),loaded=cart.load(state.reference),totals=cart.totals(loaded.cart),allowed=state.eligible&&!loaded.error&&!loaded.locked;
    if(loaded.error)ui.feedback("Không thể đọc giỏ món đã lưu. Vui lòng thử lại.");
    else if(loaded.needsReview)ui.feedback("Thực đơn hoặc giá món đã thay đổi. Vui lòng xem lại trước khi xác nhận.");
    list.replaceChildren();const facts=summary.querySelector(".food-summary-facts");facts.replaceChildren();
    for(const food of totals.items){
      const row=ui.element("article",undefined,"food-cart-item");row.dataset.foodId=food.id;row.append(ui.art(food,true));
      const info=ui.element("div",undefined,"food-cart-item-info");info.append(ui.element("h2",food.name),ui.element("p","Đơn vị: "+food.unit,"food-cart-unit"),ui.element("p","Đơn giá: "+ui.money(food.price)+"/"+food.unit,"food-cart-unit-price"),ui.quantity(food,food.quantity,allowed));
      const offer=ui.element("div",undefined,"food-cart-item-offer"),price=ui.element("div");price.append(ui.element("p","Thành tiền"),ui.element("strong",ui.money(food.lineTotal),"food-line-total"));
      const remove=ui.element("button","Xóa","food-remove");remove.type="button";remove.dataset.removeFood=food.id;remove.disabled=!allowed;remove.setAttribute("aria-label","Xóa "+food.name);offer.append(price,remove);row.append(info,offer);list.append(row);
      const fact=ui.element("div");fact.append(ui.element("dt",food.name+" × "+food.quantity),ui.element("dd",ui.money(food.lineTotal)));facts.append(fact);
    }
    if(!noteDirty)note.value=loaded.cart.note;note.disabled=!allowed;submit.disabled=!(state.eligible||loaded.locked)||Boolean(loaded.error)||!loaded.cart.items.length||busy;
    summary.querySelector(".food-summary-total dd").textContent=ui.money(totals.total);
    const hasItems=loaded.cart.items.length>0;main.hidden=!hasItems;summary.hidden=!hasItems;empty.hidden=hasItems;
    empty.querySelector("a").href=context.url("food-menu.html").href;
    if(loaded.cart.lastSubmission&&!hasItems&&!loaded.error){
      const link=ui.element("a","Xem yêu cầu dịch vụ","button button-outline"),url=context.url("services.html");url.searchParams.set("request",loaded.cart.lastSubmission);link.href=url.href;
      ui.feedback("");const feedback=document.getElementById("food-feedback");feedback.textContent="";feedback.append(link);feedback.hidden=false;
    }
  }
  function persistNote(){
    const loaded=cart.load(context.current().reference);if(loaded.locked)return !loaded.error;
    if(!noteDirty&&note.value===loaded.cart.note)return !loaded.error;
    const result=cart.setNote(context.current().reference,note.value);if(result.error){noteDirty=true;ui.feedback(result.error);return false;}noteDirty=false;return true;
  }
  note.addEventListener("input",()=>{noteDirty=true;if(persistNote())ui.feedback("");});
  list.addEventListener("click",event=>{
    const b=event.target.closest("button");if(!b||b.disabled||!list.contains(b))return;
    if(!persistNote())return;const state=context.refresh(),loaded=cart.load(state.reference);if(loaded.error){ui.feedback("Không thể đọc giỏ món. Vui lòng thử lại.");return;}
    const id=b.dataset.removeFood||b.dataset.foodId,old=loaded.cart.items.find(i=>i.foodId===id)?.quantity||0;
    const result=cart.setQuantity(state.reference,id,b.dataset.removeFood?0:old+Number(b.dataset.step));
    if(result.error){ui.feedback(result.error);return;}ui.feedback("");render();
    const next=[...list.querySelectorAll("button")].find(el=>el.dataset.foodId===id&&!el.disabled)||list.querySelector("button")||empty.querySelector("a");next?.focus({preventScroll:true});
  });
  submit.addEventListener("click",()=>{
    if(busy)return;if(!persistNote())return;busy=true;submit.disabled=true;
    let result;try{result=cart.submit(context.refresh().reference);}catch{result={error:"Chưa lưu được đơn món. Vui lòng thử lại."};}
    busy=false;
    if(result.error){render();ui.feedback(result.error);document.getElementById("food-feedback").focus({preventScroll:true});return;}
    noteDirty=false;const url=context.url("services.html");url.searchParams.set("request",result.request.id);
    try{window.location.assign(url.href);}catch{render();ui.feedback("Vui lòng mở trang Dịch vụ để kiểm tra yêu cầu.");}
  });
  window.addEventListener("pageshow",render);
  render();
})();
