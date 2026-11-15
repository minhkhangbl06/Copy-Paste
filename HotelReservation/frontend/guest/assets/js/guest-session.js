"use strict";
(() => {
  if(window.GuestSession)return;
  const validation=window.GuestValidation,script=document.currentScript;if(!validation||!script)return;
  const root=new URL("../../",script.src),home=new URL("index.html",root),key="copyPasteHotel.guestSession",version=1,demoGuestId="DEMO-GUEST-EXAMPLE";
  const workspaceKey="copyPasteHotel.guestWorkspace";
  const privateKeys=Object.freeze(["copyPasteHotel.bookingDraft","copyPasteHotel.simulatedBookings","copyPasteHotel.bookingUpdates","copyPasteHotel.foodCarts","copyPasteHotel.serviceRequests","copyPasteHotel.invoices","copyPasteHotel.reviews"]);
  const allowed=new Set(["index.html","pages/rooms.html","pages/room-detail.html","pages/booking.html","pages/booking-payment.html","pages/my-bookings.html","pages/booking-detail.html","pages/services.html","pages/food-menu.html","pages/food-cart.html","pages/invoice.html","pages/profile.html","pages/service-history.html","pages/review.html"].map(p=>new URL(p,root).pathname));
  const queryKeys=new Set(["checkIn","checkOut","guests","roomType","roomCount","sort","listRoomType","reference","filter","service","request","category","page"]);
  const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
  function safeReturn(value){
    if(typeof value!=="string"||!value||value.length>4096||/^[\s]*\/\//.test(value)||value.includes("\\"))return new URL(home);
    try{const url=new URL(value,root);if(!["http:","https:"].includes(url.protocol)||url.origin!==root.origin||url.username||url.password||!url.pathname.startsWith(root.pathname))return new URL(home);
      // Compatibility for old auth returnTo paths, not an alternate route or storage migration.
      const legacy=new URL("guest/",root).pathname;
      if(url.pathname.startsWith(legacy))url.pathname=new URL("pages/",root).pathname+url.pathname.slice(legacy.length);
      if(url.pathname===root.pathname)url.pathname=home.pathname;if(!allowed.has(url.pathname))return new URL(home);
      for(const name of [...url.searchParams.keys()])if(!queryKeys.has(name))url.searchParams.delete(name);
      if(url.hash&&!/^#[a-zA-Z][\w-]*$/.test(url.hash))url.hash="";return url;
    }catch{return new URL(home);}
  }
  function authURL(page="login",target=window.location.href){const url=new URL(["login","register","forgot-password","reset-password"].includes(page)?"auth/"+page+".html":"auth/login.html",root),back=safeReturn(target);url.searchParams.set("returnTo",back.pathname.slice(root.pathname.length)+back.search+back.hash);return url;}
  function authTarget(){const p=new URLSearchParams(window.location.search);return safeReturn(p.has("returnTo")?p.get("returnTo"):document.referrer||home.href);}
  function load(){
    try{const raw=window.sessionStorage.getItem(key);if(raw===null)return {guest:null,error:window.sessionStorage.getItem(workspaceKey)===null?null:"invalid"};const s=JSON.parse(raw);
      if(s.version!==version||s.state!=="active"||!object(s.guest)||typeof s.startedAt!=="string"||!Number.isFinite(Date.parse(s.startedAt)))return {guest:null,error:"invalid"};
      const g=s.guest;if(typeof g.id!=="string"||!/^DEMO-GUEST-(EXAMPLE|[A-F0-9]{32})$/.test(g.id)||(validation.nameError(g.fullName)||validation.phoneError(g.phone)||typeof g.email!=="string"||(g.email!==""&&validation.emailError(g.email))))return {guest:null,error:"invalid"};
      const workspace=JSON.parse(window.sessionStorage.getItem(workspaceKey)||"null");
      if(!object(workspace)||workspace.version!==version||workspace.guestId!==g.id)return {guest:null,error:"invalid"};
      return {guest:{id:g.id,fullName:g.fullName,email:g.email,phone:g.phone},startedAt:s.startedAt,error:null};
    }catch{return {guest:null,error:"unavailable"};}
  }
  function write(value){const raw=JSON.stringify(value);window.sessionStorage.setItem(key,raw);if(window.sessionStorage.getItem(key)!==raw)throw Error("storage");}
  function emit(reason){window.dispatchEvent(new CustomEvent("copyPasteHotel:sessionchange",{detail:{reason}}));}
  function clean(){
    // Mark transition before clearing. A partial failure leaves no usable old
    // identity; retry is explicit. Never pretend a half-cleared logout succeeded.
    write({version,state:"clearing"});
    for(const k of privateKeys){window.sessionStorage.removeItem(k);if(window.sessionStorage.getItem(k)!==null)throw Error("storage");}
    window.sessionStorage.removeItem(workspaceKey);if(window.sessionStorage.getItem(workspaceKey)!==null)throw Error("storage");
  }
  function start(values,register=false){
    const invalid=validation.authErrors(values,register);if(Object.keys(invalid).length)return {errors:invalid};
    try{
      // This adapter only simulates a Guest profile. Neither identifier proves ownership.
      // A phone-only preview has no known email; never invent an email from a phone.
      const current=load(),identifier=register?values.email:values.identifier;
      const byEmail=register||identifier.includes("@");
      const email=byEmail?identifier.trim().toLowerCase():"";
      const phone=byEmail?"":validation.normalizePhone(identifier.trim());
      const demo=email==="guest.demo@example.com"||phone==="0900000000";
      // Resolve reserved demo aliases before matching contact fields, which may contain the demo placeholder.
      const same=current.guest&&(demo?current.guest.id===demoGuestId:current.guest.id!==demoGuestId&&
        (byEmail?current.guest.email.toLowerCase()===email:validation.normalizePhone(current.guest.phone)===phone));
      let guest;
      if(same)guest={...current.guest};
      else{
        clean();const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
        guest={id:demo?demoGuestId:"DEMO-GUEST-"+[...bytes].map(n=>n.toString(16).padStart(2,"0")).join("").toUpperCase(),
          fullName:demo?"Nguyễn Minh An":"Khách hàng",email:demo?"guest.demo@example.com":email,phone:phone||"0900000000"};
      }
      if(register)guest={...guest,fullName:values.fullName.trim(),phone:validation.normalizePhone(values.phone.trim())};
      // Construct only whitelisted public profile fields. Passwords never reach
      // the storage envelope, ID generator, URLs or logs. Email is not ownership proof.
      const workspace=JSON.stringify({version,guestId:guest.id});
      window.sessionStorage.setItem(workspaceKey,workspace);if(window.sessionStorage.getItem(workspaceKey)!==workspace)throw Error("storage");
      write({version,state:"active",guest,startedAt:current.guest?.id===guest.id?current.startedAt:new Date().toISOString()});emit("start");return {guest,error:null};
    }catch{emit("error");return {error:"Chưa thể đăng nhập. Vui lòng thử lại."};}
  }
  function update(values){
    const current=load();if(current.error||!current.guest)return {error:"Chưa thể đọc hồ sơ. Vui lòng đăng nhập lại."};
    const errors=validation.contactErrors(values);if(Object.keys(errors).length)return {errors};
    try{const guest={id:current.guest.id,fullName:values.fullName.trim(),email:values.email.trim().toLowerCase(),phone:validation.normalizePhone(values.phone.trim())};write({version,state:"active",guest,startedAt:current.startedAt});emit("profile");return {guest,error:null};}
    catch{return {error:"Chưa lưu được hồ sơ. Vui lòng thử lại."};}
  }
  function logout(){
    try{clean();window.sessionStorage.removeItem(key);if(window.sessionStorage.getItem(key)!==null)throw Error();emit("logout");window.location.assign(home.href);return {error:null};}
    catch{emit("error");return {error:"Chưa thể đăng xuất. Vui lòng thử lại."};}
  }
  const initials=name=>name.trim().split(/\s+/).filter(Boolean).filter((_,i,a)=>i===0||i===a.length-1).map(w=>w[0]).join("").toUpperCase();
  const owner=()=>load().guest?.id||null;
  window.GuestSession=Object.freeze({key,version,workspaceKey,privateKeys,demoGuestId,root:root.href,home:home.href,load,start,update,logout,safeReturn,authURL,authTarget,initials,owner});
  // Every Guest page shares the current session's private workspace. Switching
  // identities clears the explicit keys above. Old BFCache DOM must not expose it.
  const initialOwner=owner(),isGuest=window.location.pathname.startsWith(new URL("pages/",root).pathname);
  window.addEventListener("pagehide",()=>{if(isGuest){const main=document.querySelector("main");if(main)main.hidden=true;}});
  window.addEventListener("pageshow",()=>{if(!isGuest)return;const current=load(),main=document.querySelector("main");
    if((current.guest?.id||null)!==initialOwner&&!window.location.pathname.endsWith("/profile.html")){if(main)main.hidden=true;window.location.reload();return;}
    if(main)main.hidden=false;
  });
  // One private workspace is explicitly bound to its Guest ID, not to an email
  // ownership claim. Switching Guest purges it; there is no multi-account vault.
  // Session simulation only: no credentials, access token, account registry or
  // real authorization. Replace with M5's server session and authenticated APIs.
})();
