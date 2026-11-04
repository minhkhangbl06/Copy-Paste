"use strict";
(() => {
  const page=document.querySelector(".invoice-page"),data=window.BookingData,billing=window.BillingData;
  if(!page||!data||!billing||page.dataset.contextInitialized)return;page.dataset.contextInitialized="true";
  const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const money=n=>n===null?"Chưa đủ dữ liệu":new Intl.NumberFormat("vi-VN").format(n)+" đ";
  function pair(dl,label,value){const row=el("div");row.append(el("dt",label),el("dd",value,"invoice-money"));dl.append(row);}
  function section(id,title){const s=document.querySelector('[aria-labelledby="'+id+'"]'),h=el("h2",title);h.id=id;s.replaceChildren(h);return s;}
  function amountLine(title,amount,pairs){
    const article=el("article",undefined,"invoice-line"),heading=el("div",undefined,"invoice-line-heading"),price=el("p",undefined,"invoice-line-amount");
    price.append(el("span","Thành tiền"),el("strong",money(amount)));heading.append(el("h3",title),price);
    const dl=el("dl",undefined,"invoice-item-facts");pairs.forEach(([label,value])=>pair(dl,label,value));article.append(heading,dl);return article;
  }
  function render(){
    const params=new URLSearchParams(window.location.search),reference=params.get("reference"),filter=data.normalizeFilter(params.get("filter"));
    const result=billing.load(reference),booking=result.booking,content=document.querySelector(".invoice-content"),message=document.getElementById("invoice-context-message"),back=document.querySelector(".invoice-back");
    const detail=booking?data.entryURL("booking-detail.html",booking,window.location.href,filter):data.listURL(window.location.href,filter);
    back.href=detail.href;back.textContent=booking?"← Về chi tiết booking":"← Về booking của tôi";
    content.hidden=!result.available;message.hidden=Boolean(result.available);document.querySelector(".invoice-status-list").hidden=!result.available;
    if(!result.available){
      message.querySelector("p").textContent=result.message;message.querySelector("a").href=detail.href;message.querySelector("a").textContent=back.textContent;return;
    }
    document.getElementById("invoice-status").textContent=result.finalized?"Đã chốt":"Tạm tính";
    document.getElementById("invoice-payment-status").textContent=result.paymentLabel;
    const error=document.getElementById("invoice-data-error");error.replaceChildren(...result.errors.map(text=>el("p",text)));error.hidden=!result.errors.length;
    const s=result.stay,values=[booking.reference,result.room.name,s.checkIn.split("-").reverse().join("/"),s.checkOut.split("-").reverse().join("/"),result.nights+" đêm",s.roomCount+" phòng",s.guests+" khách",data.labels[booking.bookingStatus]];
    document.querySelectorAll(".invoice-stay-facts dd").forEach((dd,i)=>{dd.textContent=values[i];});
    const room=section("room-title","Tiền phòng");room.append(amountLine(result.room.name,result.room.amount,[["Đơn giá đã lưu",result.room.unitPrice===null?"Chưa có đơn giá đã lưu":money(result.room.unitPrice)+"/đêm"],["Số lượng",s.roomCount+" phòng × "+result.nights+" đêm"]]));
    const services=section("services-title","Dịch vụ đã ghi nhận");
    if(!result.service.charged.length)services.append(el("p","Chưa có chi phí dịch vụ được ghi nhận"));
    result.service.charged.forEach(r=>{
      const group=el("div",undefined,"invoice-service-group"),heading=el("div",undefined,"invoice-service-heading");
      heading.append(el("h3",r.id+" · "+window.ServiceRequests.name(r.type)),el("span","Đã hoàn tất","invoice-badge"));group.append(heading);
      if(r.type==="food"){
        const items=el("div",undefined,"invoice-service-items");
        r.items.forEach(i=>items.append(amountLine(i.name+" × "+i.quantity,i.lineTotal??i.unitPrice*i.quantity,[["Đơn giá",money(i.unitPrice)+"/"+i.unit],["Số lượng",i.quantity+" "+i.unit]])));
        group.append(items);
      }else{
        const facts=el("dl",undefined,"invoice-item-facts");
        if(r.type==="laundry"){
          pair(facts,"Khối lượng đã cân",r.weightConfirmed==null?"Chờ xác nhận":r.weightConfirmed+" kg");
          pair(facts,"Đơn giá đã xác nhận",r.unitPriceConfirmed==null?"Chưa có thông tin":money(r.unitPriceConfirmed)+"/kg");
        }else{
          pair(facts,"Điểm đón",r.pickup||"Chưa có thông tin");pair(facts,"Điểm đến",r.destination||"Chưa có thông tin");
          pair(facts,"Quãng đường đã xác nhận",r.distanceConfirmed==null?"Chưa có thông tin":r.distanceConfirmed+" km");
          if(r.unitPriceConfirmed!=null)pair(facts,"Đơn giá đã xác nhận",money(r.unitPriceConfirmed)+"/km");
        }
        group.append(facts);
      }
      const total=el("dl",undefined,"invoice-section-total");pair(total,r.type==="food"?"Tổng tiền món":"Thành tiền đã xác nhận",money(r.costConfirmed));group.append(total);services.append(group);
    });
    const serviceTotal=el("dl",undefined,"invoice-section-total");pair(serviceTotal,"Tổng tiền dịch vụ",money(result.service.total));services.append(serviceTotal);
    const pending=section("pending-title","Dịch vụ chưa tính vào tổng"),pendingList=el("ul",undefined,"invoice-pending-list");
    result.service.pending.forEach(r=>{const li=el("li"),facts=el("dl");li.append(el("h3",r.id+" · "+window.ServiceRequests.name(r.type)),el("p",r.label+" · "+r.explanation));pair(facts,"Chi phí","Chờ xác nhận");li.append(facts);pendingList.append(li);});
    pending.append(result.service.pending.length?pendingList:el("p","Không có dịch vụ đang chờ ghi nhận chi phí."));
    const payments=section("payments-title","Lịch sử thanh toán");
    if(!result.payment.rows.length)payments.append(el("p","Chưa có giao dịch thanh toán được ghi nhận."));
    const labels={CONFIRMED:"Đã xác nhận thành công",PENDING_REVIEW:"Khách báo đã chuyển · Chờ kiểm tra",FAILED:"Thất bại",CANCELLED:"Đã hủy"};
    result.payment.rows.forEach(t=>{
      const dl=el("dl",undefined,"invoice-payment-facts");
      pair(dl,"Nội dung",t.label);if(t.kind==="REFUND")pair(dl,"Loại giao dịch","Hoàn tiền");
      if(t.occurredAt)pair(dl,"Thời điểm",new Date(t.occurredAt).toLocaleString("vi-VN"));
      pair(dl,"Phương thức",t.method);pair(dl,"Số tiền",money(t.amount));pair(dl,"Trạng thái",labels[t.status]);payments.append(dl);
    });
    const summary=section("summary-title","Tổng hợp hóa đơn"),facts=el("dl",undefined,"invoice-summary-facts");
    for(const [label,value]of [["Tiền phòng",result.room.amount],["Dịch vụ đã ghi nhận",result.service.total],["Phụ phí",result.surchargeTotal],["Giảm giá",result.discountTotal]])pair(facts,label,money(value));
    summary.append(facts);
    for(const [cls,label,value]of [["invoice-summary-facts invoice-subtotal","Tổng chi phí",result.total],["invoice-summary-facts invoice-deposit","Đã thanh toán được xác nhận",result.payment.confirmed],["invoice-balance",result.balance!==null&&result.balance<0?"Khoản thanh toán vượt tổng chi phí":"Còn phải thanh toán",result.balance===null?null:Math.abs(result.balance)]]){
      const dl=el("dl",undefined,cls);if(cls==="invoice-balance")dl.append(el("dt",label),el("dd",money(value),"invoice-money"));else pair(dl,label,money(value));summary.append(dl);
    }
    if(result.surcharges.length||result.discounts.length){
      const detail=el("dl",undefined,"invoice-summary-facts invoice-adjustment-lines");
      result.surcharges.forEach(line=>pair(detail,line.label,money(line.amount)));result.discounts.forEach(line=>pair(detail,line.label,"− "+money(line.amount)));summary.append(detail);
    }
    const notes=el("div",undefined,"invoice-summary-notes");notes.append(el("p","Phần còn lại được thanh toán tại quầy khi check-out bằng tiền mặt hoặc chuyển khoản."));
    if(!result.finalized)notes.append(el("p","Hóa đơn tạm tính có thể thay đổi khi phát sinh thêm chi phí."));
    if(result.balance!==null&&result.balance<0)notes.append(el("p","Khoản thanh toán vượt tổng chi phí cần được khách sạn đối chiếu; chưa xác nhận hoàn tiền."));
    summary.append(notes);
  }
  window.addEventListener("pageshow",render);window.addEventListener("popstate",render);render();
})();
