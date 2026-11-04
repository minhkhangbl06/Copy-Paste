"use strict";
(() => {
  const normalizePhone=value=>value.replace(/[\s-]/g,"");
  const emailError=value=>typeof value!=="string"||!value.trim()?"Vui lòng nhập email.":/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())?"":"Vui lòng nhập email hợp lệ.";
  const nameError=value=>typeof value!=="string"||!value.trim()?"Vui lòng nhập họ và tên.":"";
  const phoneError=value=>typeof value!=="string"||!value.trim()?"Vui lòng nhập số điện thoại.":/^\+?\d{7,15}$/.test(normalizePhone(value.trim()))?"":"Vui lòng nhập số điện thoại hợp lệ.";
  function contactErrors(values){const errors={};for(const[key,rule]of Object.entries({fullName:nameError,email:emailError,phone:phoneError})){const message=rule(values[key]);if(message)errors[key]=message;}return errors;}
  // UI-only minimum until M5 specifies the real signup policy. Login does not
  // apply a creation policy and passwords must never be trimmed or persisted.
  function authErrors(values,register=false){
    const errors=register?contactErrors(values):{};if(!register&&emailError(values.email))errors.email=emailError(values.email);
    if(typeof values.password!=="string"||values.password.length===0)errors.password="Vui lòng nhập mật khẩu.";
    else if(register&&values.password.length<8)errors.password="Mật khẩu phải có ít nhất 8 ký tự.";
    if(register){if(typeof values.confirmPassword!=="string"||values.confirmPassword.length===0)errors.confirmPassword="Vui lòng xác nhận mật khẩu.";
      else if(values.confirmPassword!==values.password)errors.confirmPassword="Xác nhận mật khẩu không khớp.";}
    return errors;
  }
  window.GuestValidation=Object.freeze({normalizePhone,emailError,nameError,phoneError,contactErrors,authErrors});
})();
