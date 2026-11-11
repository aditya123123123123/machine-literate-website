(() => {
  'use strict';
  // Local development and hosted previews must never contact Google or show consent UI.
  window.mlTrack = () => {};
  if (!['machineliterate.org', 'www.machineliterate.org'].includes(location.hostname)) return;

  const key = 'ml-analytics-consent';
  const readChoice = () => {
    try {
      const value = localStorage.getItem(key);
      return ['granted', 'denied'].includes(value) ? value : null;
    } catch { return null; } // Storage may be blocked; consent still works for this page.
  };
  const saveChoice = value => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* Never block the page when storage is unavailable. */ }
  };
  const deleteCookies = () => {
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0].trim();
      if (name !== '_ga' && !name.startsWith('_ga_')) continue;
      for (const domain of ['', `; domain=${location.hostname}`, '; domain=.machineliterate.org']) {
        document.cookie = `${name}=; max-age=0; path=/${domain}; SameSite=Lax; Secure`;
      }
    }
  };

  let choice = readChoice();
  let granted = choice === 'granted';
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  // Advertising consent is always denied. Only analytics has an explicit opt-in path.
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  if (granted) window.gtag('consent', 'update', { analytics_storage: 'granted' });
  else deleteCookies();
  window.gtag('js', new Date());
  window.gtag('config', 'G-VY51YYZ1TL', {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  window.mlTrack = (name, params) => {
    // Analytics must never interrupt a signup, even if the tracker is blocked.
    try { window.gtag('event', name, params); } catch { /* Keep the site usable. */ }
  };
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-VY51YYZ1TL';
  document.head.appendChild(script);

  const banner = document.createElement('section');
  banner.className = 'analytics-consent';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Analytics cookie choice');
  banner.hidden = true;
  banner.innerHTML = '<div><h2>Allow analytics cookies?</h2><p>They help us count visits and waitlist sign-ups. No ads, no tracking across sites. <a href="/privacy">Privacy</a></p></div><div class="consent-actions"><button type="button" class="btn btn-light" data-consent="granted">Allow</button><button type="button" class="btn btn-light" data-consent="denied">No thanks</button></div>';
  document.body.appendChild(banner);
  let returnFocus = document.querySelector('main');
  const reserveSpace = () => {
    const height = banner.hidden ? 0 : banner.getBoundingClientRect().height + 24;
    document.documentElement.style.setProperty('--consent-space', `${height}px`);
  };
  new ResizeObserver(reserveSpace).observe(banner);
  const show = visible => {
    banner.hidden = !visible;
    reserveSpace();
  };
  const applyChoice = value => {
    const nextGranted = value === 'granted';
    if (nextGranted !== granted) {
      window.gtag('consent', 'update', { analytics_storage: nextGranted ? 'granted' : 'denied' });
    }
    granted = nextGranted;
    if (!granted) deleteCookies();
    choice = value;
    show(choice === null);
  };
  banner.addEventListener('click', event => {
    const button = event.target.closest('button[data-consent]');
    if (!button) return;
    saveChoice(button.dataset.consent);
    applyChoice(button.dataset.consent);
    returnFocus?.focus({ preventScroll: true });
  });
  document.querySelectorAll('[data-cookie-settings]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      // Reopening settings revokes the old grant immediately, until Allow is clicked again.
      saveChoice(null);
      applyChoice(null);
      returnFocus = button;
      banner.querySelector('button').focus({ preventScroll: true });
    });
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) applyChoice(readChoice());
  });
  show(choice === null);
})();
