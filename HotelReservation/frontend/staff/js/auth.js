const form = document.getElementById('staff-login');
const feedback = document.getElementById('login-error');
const staffHome = {
  receptionist: 'index.html',
  admin: 'index.html',
  manager: 'index.html',
  housekeeping: 'housekeeping.html',
  service_staff: 'services.html',
  billing: 'billing.html'
};
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  feedback.textContent = '';
  try {
    const response = await fetch('http://127.0.0.1:8000/api/auth/login', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Đăng nhập thất bại.');
    const { user, access_token: token } = result.data;
    if (!Object.hasOwn(staffHome, user.role) || !token) {
      throw new Error('Tài khoản này chưa có quyền truy cập Staff.');
    }
    sessionStorage.setItem('hotel_staff_token', token);
    location.replace(staffHome[user.role]);
  } catch (error) {
    feedback.textContent = error instanceof TypeError
      ? 'Không kết nối được backend tại cổng 8000.'
      : error.message;
  } finally {
    button.disabled = false;
  }
});
