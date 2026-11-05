"use strict";
(() => {
  const editor=document.querySelector("[data-profile-editor]"),session=window.GuestSession;if(!editor||!session||editor.dataset.profileEditorInitialized)return;editor.dataset.profileEditorInitialized="true";
  const fields=[...editor.querySelectorAll(".profile-personal-fields input")],edit=editor.querySelector("[data-profile-edit]"),save=editor.querySelector("[data-profile-save]"),cancel=editor.querySelector("[data-profile-cancel]"),content=document.querySelector(".profile-content"),unavailable=document.getElementById("profile-unavailable"),feedback=document.getElementById("profile-feedback");
  let editing=false,snapshot=null,guestId=null;
  fields.forEach(field=>{const p=document.createElement("p");p.id=field.id+"-error";p.className="search-field-error";p.hidden=true;field.insertAdjacentElement("afterend",p);field.setAttribute("aria-describedby",p.id);});
  function errors(invalid={}){fields.forEach(f=>{const message=invalid[f.name]||"",p=document.getElementById(f.id+"-error");p.textContent=message;p.hidden=!message;f.setAttribute("aria-invalid",String(Boolean(message)));});}
  function setEditing(active,focus=true){editing=active;fields.forEach(f=>f.readOnly=!active);edit.hidden=active;save.hidden=!active;cancel.hidden=!active;editor.dataset.mode=active?"edit":"view";if(focus)(active?fields[0]:edit).focus({preventScroll:true});}
  function clear(){content.hidden=true;fields.forEach(f=>f.value="");document.querySelector(".profile-identity h2").textContent="";document.querySelector(".profile-avatar").textContent="";document.querySelectorAll(".profile-password-fields input").forEach(f=>f.value="");snapshot=null;setEditing(false,false);}
  function render(reason=""){
    const current=session.load();unavailable.querySelector("a").href=session.authURL("login",window.location.href).href;
    if(!current.guest){clear();guestId=null;unavailable.hidden=false;unavailable.querySelector("p").textContent=current.error?"Chưa thể đọc hồ sơ phiên dùng thử. Vui lòng thử lại.":"Vui lòng đăng nhập để xem thông tin cá nhân.";
      if(!current.error&&reason!=="logout")window.location.replace(session.authURL("login",window.location.href).href);return;
    }
    unavailable.hidden=true;content.hidden=false;
    document.querySelector(".profile-identity h2").textContent=current.guest.fullName;document.querySelector(".profile-avatar").textContent=session.initials(current.guest.fullName);
    if(!editing||guestId!==current.guest.id){fields.forEach(f=>f.value=current.guest[f.name]);errors();setEditing(false,false);}guestId=current.guest.id;
  }
  edit.addEventListener("click",()=>{if(editing)return;snapshot=fields.map(f=>f.value);feedback.hidden=true;setEditing(true);});
  cancel.addEventListener("click",()=>{if(!editing)return;fields.forEach((f,i)=>f.value=snapshot[i]);snapshot=null;errors();feedback.hidden=true;setEditing(false);});
  save.addEventListener("click",()=>{
    if(!editing)return;const result=session.update(Object.fromEntries(fields.map(f=>[f.name,f.value])));
    errors(result.errors||{});if(result.errors){fields.find(f=>result.errors[f.name])?.focus();return;}
    if(result.error){feedback.textContent=result.error;feedback.hidden=false;return;}
    fields.forEach(f=>f.value=result.guest[f.name]);snapshot=null;feedback.hidden=true;setEditing(false);
  });
  document.querySelector("[data-profile-logout]").addEventListener("click",()=>{const result=session.logout();if(result.error){unavailable.hidden=false;unavailable.querySelector("p").textContent=result.error;}});
  window.addEventListener("copyPasteHotel:sessionchange",event=>render(event.detail.reason));
  window.addEventListener("pageshow",()=>render());window.addEventListener("pagehide",clear);render();
})();
