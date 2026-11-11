(() => {
  'use strict';
  const form = document.querySelector('#waitlist');
  if (!form || !window.fetch) return;
  const email = form.querySelector('#wl-email');
  const msg = form.querySelector('.wl-msg');
  const btn = form.querySelector('button[type=submit]');
  const ageSet = form.querySelector('.wl-age');
  const note = form.querySelector('#wl-note');
  const label = form.querySelector('#wl-email-label');
  const NOTE = note.textContent;
  const sync = () => {
    const role = (form.querySelector('input[name=role]:checked') || {}).value;
    const age = (form.querySelector('input[name=age]:checked') || {}).value;
    ageSet.hidden = role !== 'student';
    const kid = role === 'student' && age === 'under13';
    email.placeholder = kid ? 'parent@email.com' : 'you@email.com';
    label.textContent = kid ? 'Parent or guardian email' : 'Email';
    note.textContent = kid ? 'Ask a parent or guardian to put their email here. We’ll let them know when lessons open.' : NOTE;
  };
  form.addEventListener('change', () => { sync(); if (form.classList.contains('wl-age-error')) { form.classList.remove('wl-age-error'); msg.textContent = ''; } }); sync();
  const ok = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  email.addEventListener('input', () => { form.classList.remove('wl-error'); email.removeAttribute('aria-invalid'); msg.textContent = ''; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = email.value.trim();
    const role = (form.querySelector('input[name=role]:checked') || {}).value;
    if (role === 'student' && !form.querySelector('input[name=age]:checked')) { form.classList.add('wl-age-error'); msg.textContent = 'Pick your age so we know where to send updates.'; form.querySelector('input[name=age]').focus(); return; }
    if (!ok(v)) { form.classList.add('wl-error'); email.setAttribute('aria-invalid', 'true'); msg.textContent = 'Enter a valid email address.'; email.focus(); return; }
    btn.disabled = true; btn.textContent = 'Joining…'; msg.textContent = '';
    try {
      const r = await fetch(form.getAttribute('action'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: new URLSearchParams(new FormData(form)) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
      if (typeof window.mlTrack === 'function' && ['parent', 'teacher', 'student', 'other'].includes(role)) {
        window.mlTrack('waitlist_signup', { role });
      }
      form.classList.add('wl-done');
      form.innerHTML = '<p class="wl-success" role="status" tabindex="-1"><strong>You’re on the list.</strong> We’ll email <span class="wl-addr">' + v.replace(/[<>&"]/g, '') + '</span> when lessons open.</p>';
      form.querySelector('.wl-success').focus();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Join the waitlist';
      form.classList.add('wl-error');
      msg.textContent = err.message === 'age' ? 'Pick your age so we know where to send updates.' : err.message === 'email' ? 'Enter a valid email address.' : 'That didn’t go through. Try again in a minute.';
    }
  });
})();
