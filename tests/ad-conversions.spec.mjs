import { test, expect } from '@playwright/test';
const ADS_TAG = 'AW-18570894075';
const ADS_WAITLIST = 'AW-18570894075/BG0tCNbLksAdEPu1pZdF';
const commands = page => page.evaluate(() => (window.dataLayer || []).map(entry => Array.from(entry)));
async function setup(page, request, baseURL, { path = '/', hostname = 'machineliterate.org' } = {}) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === hostname) {
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true } });
      return route.fulfill({ response: await request.get(baseURL + url.pathname + url.search) });
    }
    if (url.hostname === 'www.googletagmanager.com') return route.fulfill({ contentType: 'text/javascript', body: '// No Google network access in tests.' });
    return route.abort();
  });
  await page.goto(`https://${hostname}${path}`);
}
test.afterEach(async ({ page }) => {
  for (const c of await commands(page)) if (c[0] === 'consent') for (const key of ['ad_storage', 'ad_personalization']) if (key in c[2]) expect(c[2][key]).toBe('denied');
});
for (const param of ['gclid', 'gbraid', 'wbraid']) test(`${param} grants only ad user data and persists a boolean within the tab`, async ({ page, context, request, baseURL }) => {
  await setup(page, request, baseURL, { path: `/?${param}=fake-click` });
  let q = await commands(page);
  expect(q[0][2]).toEqual({ ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  expect(q).toContainEqual(['consent', 'update', { ad_user_data: 'granted' }]);
  expect(q).toContainEqual(['set', 'url_passthrough', true]);
  expect(q).toContainEqual(['config', ADS_TAG, { allow_ad_personalization_signals: false }]);
  expect(q.some(c => c[1] === 'ads_data_redaction')).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('ml-ad-visit'))).toBe('1');
  expect(await page.evaluate(() => localStorage.getItem('ml-ad-visit'))).toBeNull();
  await page.goto('https://machineliterate.org/get-involved');
  q = await commands(page);
  expect(q).toContainEqual(['consent', 'update', { ad_user_data: 'granted' }]);
  expect(q).toContainEqual(['set', 'url_passthrough', true]);
  await page.getByRole('button', { name: 'No thanks' }).click();
  expect(await context.cookies()).toEqual([]);
});
test('non-ad visit loads the Ads tag but has no passthrough, ad user data grant, or conversion', async ({ page, request, baseURL }) => {
  await setup(page, request, baseURL);
  await page.evaluate(() => mlTrack('waitlist_signup', { role: 'parent' }));
  const q = await commands(page);
  expect(q.filter(c => c[0] === 'consent')).toEqual([
    ['consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }],
  ]);
  expect(q.filter(c => c[0] === 'config').map(c => c[1])).toEqual(['G-VY51YYZ1TL', ADS_TAG]);
  expect(q.some(c => c[1] === 'url_passthrough')).toBe(false);
  expect(q.filter(c => c[0] === 'event')).toEqual([['event', 'waitlist_signup', { role: 'parent', send_to: 'G-VY51YYZ1TL' }]]);
  expect(JSON.stringify(q)).not.toContain(ADS_WAITLIST);
  expect(await page.evaluate(() => sessionStorage.getItem('ml-ad-visit'))).toBeNull();
});
test('ad waitlist and volunteer success send GA4 events with only role, never form text', async ({ page, request, baseURL }) => {
  await setup(page, request, baseURL, { path: '/?gclid=fake-click' });
  await page.getByRole('button', { name: 'No thanks' }).click();
  await page.fill('#wl-email', 'private@example.com');
  await page.locator('#waitlist button[type=submit]').click();
  await expect(page.locator('.wl-success')).toBeVisible();
  expect((await commands(page)).filter(c => c[0] === 'event')).toEqual([
    ['event', 'waitlist_signup', { role: 'parent', send_to: 'G-VY51YYZ1TL' }],
    ['event', 'conversion', { send_to: ADS_WAITLIST }],
  ]);
  expect(JSON.stringify(await commands(page))).not.toContain('private@example.com');
  await page.goto('https://machineliterate.org/get-involved');
  await page.fill('#vol-name', 'Private Name');
  await page.fill('#vol-email', 'private@example.com');
  await page.fill('#vol-note', 'Private Note');
  await page.selectOption('#vol-role', 'tutor');
  await page.check('#vol-age');
  await page.locator('#volunteer-form button').click();
  await expect(page.locator('#volunteer-thanks')).toBeVisible();
  expect((await commands(page)).filter(c => c[0] === 'event')).toEqual([
    ['event', 'volunteer_signup', { role: 'tutor', send_to: 'G-VY51YYZ1TL' }],
  ]);
  await page.evaluate(() => {
    mlTrack('volunteer_signup', { role: 'tutor', email: 'private@example.com', name: 'Private Name', note: 'Private Note' });
    mlTrack('waitlist_signup', { role: 'parent', email: 'private@example.com' });
  });
  expect((await commands(page)).filter(c => c[0] === 'event')).toEqual([
    ['event', 'volunteer_signup', { role: 'tutor', send_to: 'G-VY51YYZ1TL' }],
    ['event', 'volunteer_signup', { role: 'tutor', send_to: 'G-VY51YYZ1TL' }],
    ['event', 'waitlist_signup', { role: 'parent', send_to: 'G-VY51YYZ1TL' }],
    ['event', 'conversion', { send_to: ADS_WAITLIST }],
  ]);
  expect(JSON.stringify(await commands(page))).not.toMatch(/private@example|Private Name|Private Note|"email"|"note"|"name"/);
});
test('blocked sessionStorage still measures the current ad page without throwing', async ({ page, request, baseURL }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } }); });
  await setup(page, request, baseURL, { path: '/?gclid=x' });
  expect(await commands(page)).toContainEqual(['consent', 'update', { ad_user_data: 'granted' }]);
  expect(errors).toEqual([]);
});
test('preview ad URL remains a complete Google no-op', async ({ page, request, baseURL }) => {
  await setup(page, request, baseURL, { path: '/?gclid=x', hostname: 'preview.vercel.app' });
  expect(await commands(page)).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem('ml-ad-visit'))).toBeNull();
});
test('ad conversion fires only after a successful waitlist API response', async ({ page, request, baseURL }) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'machineliterate.org') {
      if (url.pathname === '/api/waitlist') return route.fulfill({ status: 500, json: { ok: false } });
      return route.fulfill({ response: await request.get(baseURL + url.pathname + url.search) });
    }
    if (url.hostname === 'www.googletagmanager.com') return route.fulfill({ contentType: 'text/javascript', body: '' });
    return route.abort();
  });
  await page.goto('https://machineliterate.org/?gclid=fake-click');
  await page.fill('#wl-email', 'private@example.com');
  await page.locator('#waitlist button[type=submit]').click();
  await expect(page.locator('.wl-msg')).toContainText('didn’t go through');
  expect((await commands(page)).filter(c => c[0] === 'event')).toEqual([]);
});
