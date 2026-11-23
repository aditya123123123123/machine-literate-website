(() => {
  'use strict';
  const form = document.querySelector('#volunteer-form');
  if (!form) return;
  const thanks = document.querySelector('#volunteer-thanks');
  if (new URLSearchParams(location.search).get('joined') === '1') thanks.classList.add('is-visible');
  const fields = Object.fromEntries(['name', 'email', 'role', 'note', 'age13'].map(key => [key, form.elements.namedItem(key)]));
  document.querySelectorAll('[data-volunteer-role]').forEach(link => {
    link.addEventListener('click', () => { fields.role.value = link.dataset.volunteerRole; });
  });
  if (!window.fetch) return;
  form.noValidate = true;
  const msg = form.querySelector('.wl-msg');
  const btn = form.querySelector('button[type=submit]');
  const messages = {
    name: 'Enter your name (up to 100 characters).',
    email: 'Enter a valid email address.',
    role: 'Pick how you’d like to help.',
    note: 'Keep your note to 500 characters or fewer.',
    age13: 'Under 13? Ask a parent or guardian to email us instead.',
  };
  const error = key => {
    msg.textContent = messages[key] || 'That didn’t go through. Try again in a minute.';
    if (fields[key]) { fields[key].setAttribute('aria-invalid', 'true'); fields[key].focus(); }
  };
  form.addEventListener('input', e => { e.target.removeAttribute('aria-invalid'); msg.textContent = ''; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!fields.age13.checked) return error('age13');
    if (!fields.name.value.trim() || fields.name.value.trim().length > 100) return error('name');
    if (fields.email.value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email.value.trim())) return error('email');
    if (fields.note.value.trim().length > 500) return error('note');
    const role = fields.role.value;
    btn.disabled = true; btn.textContent = 'Signing up…'; msg.textContent = '';
    try {
      const response = await fetch(form.getAttribute('action'), {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'failed');
      // A blocked or broken tracker must not undo a successful signup.
      try { window.mlTrack?.('volunteer_signup', { role }); } catch { /* Keep signup usable. */ }
      thanks.classList.add('is-visible');
      thanks.focus();
      form.reset();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Sign up to volunteer';
      error(err.message);
    }
  });
})();
