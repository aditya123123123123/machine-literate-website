(() => {
  'use strict';
  // Local development and hosted previews must never contact Google.
  window.mlTrack = () => {};
  if (!['machineliterate.org', 'www.machineliterate.org'].includes(location.hostname)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  // Keep all storage and advertising consent denied. There is no grant path.
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
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
})();
