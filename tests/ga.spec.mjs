import { readdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const pages = readdirSync(new URL('../public/', import.meta.url)).filter(name => name.endsWith('.html')).sort();
const measurementId = 'G-VY51YYZ1TL';
const commands = page => page.evaluate(() => (window.dataLayer || []).map(entry => Array.from(entry)));
const banner = page => page.getByRole('region', { name: 'Analytics cookie choice' });
const choice = page => page.evaluate(() => localStorage.getItem('ml-analytics-consent'));
const updates = async page => (await commands(page)).filter(entry => entry[0] === 'consent' && entry[1] === 'update');

// Applies to every consent path, including signup and reload tests below.
test.afterEach(async ({ page }) => {
  for (const command of await commands(page)) {
    if (command[0] !== 'consent') continue;
    for (const key of ['ad_storage', 'ad_user_data', 'ad_personalization']) {
      if (key in command[2]) expect(command[2][key]).toBe('denied');
    }
  }
});

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
    await expect(banner(page)).toBeVisible();
    expect(await choice(page)).toBeNull();
    expect(await updates(page)).toEqual([]);
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
    await expect(banner(page)).toHaveCount(0);
    await expect(page.locator('[data-cookie-settings]')).toBeHidden();
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.dataLayer)).toBe('undefined');
    expect(external).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });
}

for (const path of pages) {
  test(`GA is loaded once but inactive on localhost: ${path}`, async ({ page, context }) => {
    const googleRequests = [];
    page.on('request', request => { if (/google-analytics|googletagmanager/.test(request.url())) googleRequests.push(request.url()); });
    await page.goto(`/${path}`, { waitUntil: 'networkidle' });
    await expect(page.locator('footer [data-cookie-settings]')).toHaveCount(1);
    const scripts = page.locator('head script[src="assets/ga.js"]');
    await expect(scripts).toHaveCount(1);
    expect(await scripts.evaluate(script => script.defer)).toBe(true);
    await expect(banner(page)).toHaveCount(0);
    await expect(page.locator('[data-cookie-settings]')).toBeHidden();
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.dataLayer)).toBe('undefined');
    await page.evaluate(() => window.mlTrack?.('waitlist_signup', { role: 'parent' }));
    expect(googleRequests).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });
}

for (const hostname of ['machineliterate.org', 'www.machineliterate.org']) {
  test(`Allow persists and precedes the first page view on reload: ${hostname}`, async ({ page, request, baseURL }) => {
    await production(page, request, baseURL, hostname);
    await banner(page).getByRole('button', { name: 'Allow', exact: true }).click();
    expect(await choice(page)).toBe('granted');
    expect(await updates(page)).toEqual([['consent', 'update', { analytics_storage: 'granted' }]]);
    await expect(banner(page)).toBeHidden();
    await page.reload();
    await expect(banner(page)).toBeHidden();
    const queue = await commands(page);
    expect(queue).toHaveLength(4);
    expect(queue[0][1]).toBe('default');
    expect(queue[0][2].analytics_storage).toBe('denied');
    expect(queue[1]).toEqual(['consent', 'update', { analytics_storage: 'granted' }]);
    expect(queue[2][0]).toBe('js');
    expect(queue[3]).toEqual(['config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false }]);
  });

  test(`No thanks persists without a grant: ${hostname}`, async ({ page, context, request, baseURL }) => {
    await production(page, request, baseURL, hostname);
    await banner(page).getByRole('button', { name: 'No thanks' }).click();
    expect(await choice(page)).toBe('denied');
    expect(await updates(page)).toEqual([]);
    await expect(banner(page)).toBeHidden();
    await page.reload();
    await expect(banner(page)).toBeHidden();
    expect(await choice(page)).toBe('denied');
    expect(await commands(page)).toHaveLength(3);
    expect(await updates(page)).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });

  test(`settings revoke immediately and clear both GA cookie scopes: ${hostname}`, async ({ page, context, request, baseURL }) => {
    await production(page, request, baseURL, hostname);
    await banner(page).getByRole('button', { name: 'Allow', exact: true }).click();
    await context.addCookies([
      { name: '_ga', value: 'host-test', url: `https://${hostname}/` },
      { name: '_ga_TEST', value: 'host-stream-test', url: `https://${hostname}/` },
      { name: '_ga', value: 'domain-test', domain: '.machineliterate.org', path: '/' },
      { name: '_ga_TEST', value: 'domain-stream-test', domain: '.machineliterate.org', path: '/' },
      { name: 'unrelated', value: 'keep', url: `https://${hostname}/` },
    ]);
    expect((await context.cookies()).filter(cookie => cookie.name.startsWith('_ga')).length).toBeGreaterThanOrEqual(2);
    const settings = page.getByRole('button', { name: 'Cookie settings' });
    await settings.click();
    expect(await choice(page)).toBeNull();
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).getByRole('button', { name: 'Allow', exact: true })).toBeFocused();
    expect((await updates(page)).at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect((await context.cookies()).map(cookie => cookie.name)).toEqual(['unrelated']);
    await banner(page).getByRole('button', { name: 'No thanks' }).click();
    await expect(settings).toBeFocused();
    expect(await choice(page)).toBe('denied');
    await page.reload();
    await expect(banner(page)).toBeHidden();
    expect(await updates(page)).toEqual([]);
    expect((await context.cookies()).map(cookie => cookie.name)).toEqual(['unrelated']);
    // A prior decline can also be changed to an explicit grant.
    await settings.click();
    await banner(page).getByRole('button', { name: 'Allow', exact: true }).click();
    expect(await choice(page)).toBe('granted');
  });
}

for (const path of pages) {
  test(`production footer settings work on ${path}`, async ({ page, request, baseURL }) => {
    await production(page, request, baseURL);
    await banner(page).getByRole('button', { name: 'No thanks' }).click();
    await page.goto(`https://machineliterate.org/${path}`);
    await expect(banner(page)).toBeHidden();
    await page.getByRole('button', { name: 'Cookie settings' }).click();
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });
}

for (const width of [390, 1440]) {
  test(`banner accessibility, equal actions and usable waitlist at ${width}px`, async ({ page, request, baseURL }) => {
    await page.setViewportSize({ width, height: 844 });
    await production(page, request, baseURL);
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    // Match the repository's full-page WCAG gates; also run all rules on the new region.
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations);
    expect(violations).toEqual([]);
    expect(await page.evaluate(async () => (await window.axe.run('.analytics-consent')).violations)).toEqual([]);
    const box = await banner(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.height).toBeLessThan(260);
    const allow = banner(page).getByRole('button', { name: 'Allow', exact: true });
    const decline = banner(page).getByRole('button', { name: 'No thanks' });
    const a = await allow.boundingBox();
    const d = await decline.boundingBox();
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(a.width).toBeCloseTo(d.width, 0);
    expect(a.height).toEqual(d.height);
    await allow.focus();
    await page.keyboard.press('Tab');
    await expect(decline).toBeFocused();
    // Do not dismiss the banner: form use must not require making a choice.
    await page.locator('#wl-email').fill('private-mobile@example.com');
    await page.locator('#waitlist button[type=submit]').click();
    await expect(page.locator('.wl-success')).toBeVisible();
    await expect(banner(page)).toBeVisible();
    expect((await commands(page)).filter(entry => entry[0] === 'event')).toEqual([['event', 'waitlist_signup', { role: 'parent' }]]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('opted-in signup still sends role only, never email or age', async ({ page, request, baseURL }) => {
  await production(page, request, baseURL);
  await banner(page).getByRole('button', { name: 'Allow', exact: true }).click();
  await page.locator('input[name=role][value=student]').check();
  await page.locator('input[name=age][value=under13]').check();
  await page.fill('#wl-email', 'private-opt-in@example.com');
  await page.locator('#waitlist button[type=submit]').click();
  await expect(page.locator('.wl-success')).toBeVisible();
  const queue = await commands(page);
  expect(queue.filter(entry => entry[0] === 'event')).toEqual([['event', 'waitlist_signup', { role: 'student' }]]);
  expect(JSON.stringify(queue)).not.toMatch(/private-opt-in|under13|13plus|"email"|"age"/);
});

test('blocked localStorage never breaks consent or signup', async ({ page, request, baseURL }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Storage.prototype[method] = () => { throw new Error('Storage blocked'); };
    }
  });
  await production(page, request, baseURL);
  await expect(banner(page)).toBeVisible();
  await banner(page).getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(banner(page)).toBeHidden();
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await banner(page).getByRole('button', { name: 'No thanks' }).click();
  await page.fill('#wl-email', 'private-storage@example.com');
  await page.locator('#waitlist button[type=submit]').click();
  await expect(page.locator('.wl-success')).toBeVisible();
  expect(errors).toEqual([]);
});

test('signup still succeeds when analytics is missing', async ({ page }) => {
  await page.route('**/assets/ga.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await page.fill('#wl-email', 'parent@example.com');
  await page.locator('#waitlist button[type=submit]').click();
  await expect(page.locator('.wl-success')).toBeVisible();
});
