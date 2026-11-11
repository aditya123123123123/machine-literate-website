import { readdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const pages = readdirSync(new URL('../public/', import.meta.url)).filter(name => name.endsWith('.html')).sort();
const measurementId = 'G-VY51YYZ1TL';
const commands = page => page.evaluate(() => (window.dataLayer || []).map(entry => Array.from(entry)));

// All simulated production traffic is intercepted: never visit production or Google.
async function production(page, request, baseURL, hostname = 'machineliterate.org', result = { ok: true }, status = 200) {
  const external = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === hostname) {
      if (url.pathname === '/api/waitlist') {
        expect(route.request().method()).toBe('POST');
        return route.fulfill({ status, json: result });
      }
      const response = await request.get(`${baseURL}${url.pathname}${url.search}`);
      return route.fulfill({ response });
    }
    external.push(url.href);
    if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js') {
      return route.fulfill({ contentType: 'text/javascript', body: '// Harmless GA stub; inspect the real initialization queue.' });
    }
    return route.abort();
  });
  await page.goto(`https://${hostname}/`, { waitUntil: 'networkidle' });
  return external;
}

for (const hostname of ['machineliterate.org', 'www.machineliterate.org']) {
  test(`production consent precedes config, without cookies or GTM: ${hostname}`, async ({ page, context, request, baseURL }) => {
    const external = await production(page, request, baseURL, hostname);
    expect(external).toEqual([`https://www.googletagmanager.com/gtag/js?id=${measurementId}`]);
    const queue = await commands(page);
    expect(queue).toHaveLength(3);
    expect(queue[0]).toEqual(['consent', 'default', {
      ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    }]);
    expect(queue[1][0]).toBe('js');
    expect(queue[2]).toEqual(['config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false }]);
    expect(await page.locator('script[src*="googletagmanager"]').evaluate(script => script.async)).toBe(true);
    expect(external.join(' ')).not.toMatch(/gtm\.js|GTM-WMD4BZZK/);
    expect(await context.cookies()).toEqual([]);
  });
}

for (const role of ['parent', 'teacher', 'student', 'other']) {
  test(`successful signup sends only the ${role} role`, async ({ page, context, request, baseURL }) => {
    const external = await production(page, request, baseURL);
    const email = 'private-signup@example.com';
    await page.locator(`input[name=role][value=${role}]`).check();
    if (role === 'student') await page.locator('input[name=age][value=under13]').check();
    await page.fill('#wl-email', email);
    await page.locator('#waitlist button[type=submit]').click();
    await expect(page.locator('.wl-success')).toBeVisible();
    const queue = await commands(page);
    expect(queue.filter(entry => entry[0] === 'event')).toEqual([['event', 'waitlist_signup', { role }]]);
    expect(JSON.stringify(queue)).not.toContain(email);
    expect(JSON.stringify(queue)).not.toMatch(/under13|13plus|"email"|"age"/);
    expect(external).toEqual([`https://www.googletagmanager.com/gtag/js?id=${measurementId}`]);
    expect(await context.cookies()).toEqual([]);
  });
}

for (const [status, result] of [[200, { ok: false }], [500, { ok: true }]]) {
  test(`failed signup sends no event: HTTP ${status}, ok ${result.ok}`, async ({ page, request, baseURL }) => {
    await production(page, request, baseURL, 'machineliterate.org', result, status);
    await page.fill('#wl-email', 'not-tracked@example.com');
    await page.locator('#waitlist button[type=submit]').click();
    await expect(page.locator('.wl-msg')).toContainText('That didn’t go through');
    expect((await commands(page)).filter(entry => entry[0] === 'event')).toEqual([]);
    expect(JSON.stringify(await commands(page))).not.toContain('not-tracked@example.com');
  });
}

for (const hostname of ['preview.vercel.app', 'machineliterate.org.example.com', 'machineliterate.com']) {
  test(`GA does nothing on non-production hostname ${hostname}`, async ({ page, request, baseURL, context }) => {
    const external = await production(page, request, baseURL, hostname);
    await page.evaluate(() => window.mlTrack?.('waitlist_signup', { role: 'parent' }));
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.dataLayer)).toBe('undefined');
    expect(external).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });
}

for (const path of pages) {
  test(`GA is loaded once but inactive on localhost: ${path}`, async ({ page, context }) => {
    const googleRequests = [];
    page.on('request', request => { if (request.url().includes('googletagmanager')) googleRequests.push(request.url()); });
    await page.goto(`/${path}`, { waitUntil: 'networkidle' });
    const scripts = page.locator('head script[src="assets/ga.js"]');
    await expect(scripts).toHaveCount(1);
    expect(await scripts.evaluate(script => script.defer)).toBe(true);
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.dataLayer)).toBe('undefined');
    await page.evaluate(() => window.mlTrack?.('waitlist_signup', { role: 'parent' }));
    expect(googleRequests).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });
}

test('signup still succeeds when analytics is missing', async ({ page }) => {
  await page.route('**/assets/ga.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await page.fill('#wl-email', 'parent@example.com');
  await page.locator('#waitlist button[type=submit]').click();
  await expect(page.locator('.wl-success')).toBeVisible();
});
