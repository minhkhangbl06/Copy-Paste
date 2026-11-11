"use strict";
(() => {
  const mode=document.body.dataset.recovery,form=document.getElementById("auth-form"),session=window.GuestSession,rules=window.GuestValidation;
  if(!mode||!form||!session||!rules)return;
  const fields=[...form.querySelectorAll("input")],feedback=document.getElementById("recovery-feedback"),target=session.authTarget();
  document.querySelectorAll("[data-recovery-link]").forEach(link=>link.href=session.authURL(link.dataset.recoveryLink,target.href).href);
  document.querySelector(".auth-home").href=session.home;
  function errors(){if(mode==="forgot"){const message=rules.emailError(fields[0].value);return message?{email:message}:{};}return rules.passwordErrors(Object.fromEntries(fields.map(f=>[f.name,f.value])));}
  function paint(messages){fields.forEach(f=>{const message=messages[f.name]||"",error=document.getElementById(f.id+"-error");error.textContent=message;error.hidden=!message;f.setAttribute("aria-invalid",String(Boolean(message)));});}
  form.addEventListener("submit",event=>{
    event.preventDefault();feedback.textContent="";feedback.hidden=true;const invalid=errors();paint(invalid);
    const first=fields.find(f=>invalid[f.name]);if(first){first.focus();return;}
    // No recovery API/token exists in current routes. M5 must supply email recovery,
    // validate token expiry/one-time use and define the final password policy.
    // Future API response must not reveal account existence:
    // Nếu email này được liên kết với một tài khoản, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.
    // Validation only: show no email/reset completion response until M5 provides the API.
  });
  form.addEventListener("input",()=>{feedback.textContent="";feedback.hidden=true;if(fields.some(f=>f.getAttribute("aria-invalid")==="true"))paint(errors());});
})();
