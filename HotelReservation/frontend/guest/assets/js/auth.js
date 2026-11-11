"use strict";
(() => {
  if(document.body.dataset.authControlsInitialized)return;document.body.dataset.authControlsInitialized="true";
  function clearPasswords(){document.querySelectorAll(".password-control input").forEach(input=>{input.value="";input.type="password";});document.querySelectorAll(".password-toggle").forEach(b=>{b.dataset.visible="false";b.setAttribute("aria-label","Hiện mật khẩu");});}
  document.querySelectorAll(".password-toggle").forEach(button=>{
    const input=document.getElementById(button.getAttribute("aria-controls"));if(!input)return;
    const sync=()=>{const visible=input.type==="text";button.dataset.visible=String(visible);button.setAttribute("aria-label",visible?"Ẩn mật khẩu":"Hiện mật khẩu");};
    sync();button.addEventListener("click",()=>{const start=input.selectionStart,end=input.selectionEnd,direction=input.selectionDirection;input.type=input.type==="password"?"text":"password";sync();if(start!==null&&end!==null)input.setSelectionRange(start,end,direction||"none");});
  });
  window.addEventListener("pagehide",clearPasswords);
  const form=document.getElementById("auth-form"),session=window.GuestSession,rules=window.GuestValidation;if(!form||!session||!rules||document.body.dataset.recovery)return;
  const register=document.body.classList.contains("auth-register"),fields=Object.fromEntries([...form.querySelectorAll("input")].map(f=>[f.name,f])),submit=form.querySelector(".auth-submit"),general=document.getElementById("auth-error");
  let busy=false;const initialGuest=session.load().guest?.id||null;
  Object.values(fields).forEach(field=>{const error=document.createElement("p");error.id=field.id+"-error";error.className="search-field-error";error.hidden=true;(field.closest(".password-control")||field).insertAdjacentElement("afterend",error);field.setAttribute("aria-describedby",error.id);});
  const read=()=>Object.fromEntries(Object.entries(fields).map(([name,f])=>[name,f.value]));
  function paint(errors){Object.entries(fields).forEach(([name,f])=>{const text=errors[name]||"",p=document.getElementById(f.id+"-error");p.textContent=text;p.hidden=!text;f.setAttribute("aria-invalid",String(Boolean(text)));});}
  function links(){const target=session.authTarget();const forgot=document.querySelector("[data-forgot-link]");if(forgot)forgot.href=session.authURL("forgot-password",target.href).href;document.querySelector(".auth-home").href=session.home;document.querySelector(".auth-back").href=target.href;document.querySelector(".auth-text-link").href=session.authURL(register?"login":"register",target.href).href;return target;}
  form.addEventListener("input",event=>{if(event.target.getAttribute("aria-invalid")==="true"||event.target.name==="password"&&fields.confirmPassword?.getAttribute("aria-invalid")==="true")paint(rules.authErrors(read(),register));});
  form.addEventListener("submit",event=>{
    event.preventDefault();if(busy)return;const values=read(),errors=rules.authErrors(values,register);paint(errors);general.hidden=true;
    const first=Object.keys(fields).find(name=>errors[name]);if(first){fields[first].focus();return;}
    busy=true;submit.disabled=true;const result=session.start(values,register);busy=false;submit.disabled=false;
    if(result.error||result.errors){if(result.errors)paint(result.errors);general.textContent=result.error||"Vui lòng kiểm tra thông tin.";general.hidden=false;return;}
    const target=links();clearPasswords();form.reset();window.location.assign(target.href);
  });
  window.addEventListener("pageshow",event=>{if(event.persisted)clearPasswords();if((session.load().guest?.id||null)!==initialGuest)form.reset();links();});
  links();
})();
