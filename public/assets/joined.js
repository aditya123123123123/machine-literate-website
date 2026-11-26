(() => {
  'use strict';
  const roles = ['parent', 'teacher', 'student', 'other'];
  const url = new URL(location.href);
  const fallbackRole = url.searchParams.get('role');
  let role;
  let email;
  try {
    role = sessionStorage.getItem('ml-joined');
    email = sessionStorage.getItem('ml-joined-email');
    // Consume before tracking so reloads and back-navigation cannot count again.
    sessionStorage.removeItem('ml-joined');
    sessionStorage.removeItem('ml-joined-email');
  } catch {
    role = null;
    email = null;
  }
  if (url.searchParams.has('role')) {
    url.searchParams.delete('role');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  if (!roles.includes(role)) role = fallbackRole;
  if (!roles.includes(role)) return;
  if (email) {
    const address = document.querySelector('.wl-addr');
    address.textContent = email;
    address.closest('.joined-email').hidden = false;
  }
  if (typeof window.mlTrack === 'function') window.mlTrack('waitlist_signup', { role });
})();
