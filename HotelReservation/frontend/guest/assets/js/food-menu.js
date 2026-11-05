"use strict";
(() => {
  const grid=document.querySelector(".food-menu-grid"),catalog=window.FoodCatalog,cart=window.FoodCart,context=window.FoodBookingContext,ui=window.FoodUI;
  if(!grid||!catalog||!cart||!context||grid.dataset.initialized)return;grid.dataset.initialized="true";
  const categories=[...document.querySelectorAll(".food-category[data-category]")],pagination=document.querySelector(".food-pagination");
  const numbers=pagination.querySelector(".food-page-numbers"),previous=pagination.querySelector('[data-page-step="-1"]'),next=pagination.querySelector('[data-page-step="1"]');
  const bar=document.querySelector(".food-cart-bar"),pageSize=8;
  let category="all",page=1,pageCount=1,loaded;
  function readNavigation(){
    const p=new URLSearchParams(window.location.search);category=Object.hasOwn(catalog.categories,p.get("category"))?p.get("category"):"all";
    page=/^[1-9]\d*$/.test(p.get("page")||"")&&Number.isSafeInteger(Number(p.get("page")))?Number(p.get("page")):1;
  }
  function saveNavigation(push=false){
    const url=new URL(window.location.href);url.searchParams.set("category",category);url.searchParams.set("page",String(page));
    if(url.href!==window.location.href)window.history[push?"pushState":"replaceState"](null,"",url);
  }
  function render(){
    const state=context.refresh();loaded=cart.load(state.reference);
    if(loaded.error)ui.feedback("Không thể đọc giỏ món đã lưu. Vui lòng thử lại.");
    const summary=cart.totals(loaded.cart),allowed=state.eligible&&!loaded.error&&!loaded.locked;
    if(loaded.locked)ui.feedback("Yêu cầu đã được lưu. Mở giỏ món để hoàn tất lần gửi trước.");
    const filtered=catalog.items.filter(i=>category==="all"||i.category===category);
    pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pageCount);saveNavigation();
    grid.replaceChildren();
    for(const food of filtered.slice((page-1)*pageSize,page*pageSize)){
      const count=loaded.cart.items.find(i=>i.foodId===food.id)?.quantity||0;
      const card=ui.element("article",undefined,"food-card");card.dataset.foodId=food.id;card.setAttribute("aria-labelledby",food.id+"-title");card.append(ui.art(food));
      const content=ui.element("div",undefined,"food-card-content"),title=ui.element("h2",food.name);title.id=food.id+"-title";
      content.append(ui.element("p",catalog.categories[food.category],"food-category-label"),title,ui.element("p",food.description,"food-description"));
      const price=ui.element("p",new Intl.NumberFormat("vi-VN").format(food.price)+" ","food-price");price.append(ui.element("span","đ/"+food.unit));
      const quantity=ui.element("div",undefined,"food-card-quantity");quantity.append(ui.quantity(food,count,allowed));
      content.append(price,quantity);card.append(content);grid.append(card);
    }
    categories.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.category===category)));
    pagination.hidden=pageCount<=1;previous.disabled=page===1;next.disabled=page===pageCount;numbers.replaceChildren();
    for(let n=1;n<=pageCount;n++){const b=ui.element("button",String(n),"button button-outline");b.type="button";b.dataset.page=String(n);b.setAttribute("aria-label","Trang "+n);b.setAttribute("aria-controls",grid.id);if(n===page)b.setAttribute("aria-current","page");numbers.append(b);}
    bar.hidden=!summary.count||Boolean(loaded.error);
    bar.querySelector(".food-cart-count").textContent=summary.count+" loại món - Tổng số lượng: "+summary.quantity+" đã chọn";
    bar.querySelector(".food-cart-bar-price strong").textContent=ui.money(summary.total);
    bar.querySelector("a").href=context.url("food-cart.html").href;
  }
  function listStart(){
    grid.focus({preventScroll:true});const top=Math.max(0,document.getElementById("site-header")?.getBoundingClientRect().bottom||0)+16;
    window.scrollBy({top:grid.getBoundingClientRect().top-top,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  }
  categories.forEach(b=>b.addEventListener("click",()=>{category=b.dataset.category;page=1;saveNavigation(true);render();}));
  pagination.addEventListener("click",event=>{
    const b=event.target.closest("button");if(!b||b.disabled||!pagination.contains(b))return;
    const target=b.dataset.page?Number(b.dataset.page):page+Number(b.dataset.pageStep);if(target===page||target<1||target>pageCount)return;
    page=target;saveNavigation(true);render();listStart();
  });
  grid.addEventListener("click",event=>{
    const b=event.target.closest("[data-step]");if(!b||b.disabled||!grid.contains(b))return;
    const state=context.refresh(),fresh=cart.load(state.reference);if(fresh.error){ui.feedback("Không thể đọc giỏ món. Vui lòng thử lại.");return;}
    const count=fresh.cart.items.find(i=>i.foodId===b.dataset.foodId)?.quantity||0;
    const result=cart.setQuantity(state.reference,b.dataset.foodId,count+Number(b.dataset.step));
    if(result.error){ui.feedback(result.error);return;}ui.feedback("");const id=b.dataset.foodId,step=b.dataset.step;render();
    const controls=[...grid.querySelectorAll("[data-step]")].filter(b=>b.dataset.foodId===id);
    (controls.find(b=>b.dataset.step===step&&!b.disabled)||controls.find(b=>!b.disabled))?.focus({preventScroll:true});
  });
  window.addEventListener("pageshow",()=>{readNavigation();render();});
  window.addEventListener("popstate",()=>{readNavigation();render();});
  readNavigation();render();
})();
