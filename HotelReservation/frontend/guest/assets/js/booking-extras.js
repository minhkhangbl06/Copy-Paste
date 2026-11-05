"use strict";
(() => {
  const data=window.ServiceRequests;
  if(!data)return;
  function forBooking(reference,booking=null){
    const saved=data.load(reference),services=saved.requests.filter(data.billable).map(request=>({
      ...request,reference:request.id,name:data.name(request.type),status:request.status,items:request.items||[],
    }));
    const pending=saved.requests.filter(r=>!["COMPLETED","CANCELLED"].includes(r.status)).map(r=>({
      reference:r.id,name:data.name(r.type),description:data.label(r)+(r.type==="laundry"&&r.weightConfirmed!==null?" · Khối lượng: "+r.weightConfirmed+" kg":""),
      price:r.type==="transport"?"Chờ báo giá":"Chờ xác nhận",
    }));
    // Internal fixture ID, not a fabricated bank transaction ID. This is the
    // same deposit as BookingData.confirmedAmount, never an extra payment.
    let payments=reference==="CP-B003"?[{id:"SAMPLE-CP-B003-DEPOSIT",bookingReference:reference,kind:"PAYMENT",label:"Đặt cọc đặt phòng",method:"Chuyển khoản",amount:1080000,status:"CONFIRMED",occurredAt:null}]:[];
    if(booking?.transactions!==undefined)payments=booking.transactions;
    else if(booking?.paymentStatus==="PENDING_REVIEW"&&booking.reportedAmount!==null){
      payments=[...payments,{id:"REPORT-"+reference,bookingReference:reference,kind:"PAYMENT",label:booking.plan==="full"?"Khách báo chuyển tiền phòng":"Khách báo chuyển tiền cọc",method:"Chuyển khoản",amount:booking.reportedAmount,status:"PENDING_REVIEW",occurredAt:null}];
    }
    return {requests:saved.requests,services,pending,error:saved.error,hasRequests:saved.requests.length>0,payments};
  }
  // Same request ownership/cancellation/billable rules as services.html.
  window.BookingExtras=Object.freeze({forBooking});
})();
