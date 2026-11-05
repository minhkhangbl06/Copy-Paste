"use strict";
(() => {
  const money=n=>new Intl.NumberFormat("vi-VN").format(n)+" đ";
  function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  function art(food,small=false){
    if(food.image){const image=element("img");image.src=food.image;image.alt=food.name;return image;}
    const e=element("div",undefined,"food-placeholder"+(food.category==="drink"?" food-placeholder-drink":"")+(small?" food-placeholder-small":""));e.setAttribute("aria-hidden","true");return e;
  }
  function quantity(food,count,allowed){
    const group=element("div",undefined,"food-quantity");group.setAttribute("role","group");group.setAttribute("aria-label","Số lượng "+food.name);
    for(const step of [-1,1]){const b=element("button",step===-1?"−":"+","button button-outline food-quantity-button");b.type="button";b.dataset.foodId=food.id;b.dataset.step=String(step);b.setAttribute("aria-label",(step===-1?"Giảm":"Tăng")+" số lượng "+food.name);b.disabled=!allowed||(step===-1&&count===0);group.append(b);if(step===-1)group.append(element("span",String(count),"food-quantity-value"));}
    return group;
  }
  function feedback(text){const e=document.getElementById("food-feedback");e.textContent=text||"";e.hidden=!text;}
  window.FoodUI=Object.freeze({money,element,art,quantity,feedback});
})();
