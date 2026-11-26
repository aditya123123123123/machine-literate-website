import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const commands = page => page.evaluate(() => (window.dataLayer || []).map(entry => Array.from(entry)));
async function production(page, request, baseURL) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'machineliterate.org') return route.fulfill({ response: await request.get(baseURL + url.pathname + url.search) });
    if (url.hostname === 'www.googletagmanager.com') return route.fulfill({ contentType: 'text/javascript', body: '// No Google network access in tests.' });
    return route.abort();
  });
}

test.afterEach(async ({ page, context }) => {
  for (const command of await commands(page)) {
    if (command[0] !== 'consent') continue;
    for (const key of ['ad_storage', 'ad_user_data', 'ad_personalization']) {
      if (key in command[2]) expect(command[2][key]).toBe('denied');
    }
  }
  expect(await context.cookies()).toEqual([]);
});

test('joined is noindex with shared metadata and ordered deferred tracking', async ({ page }) => {
  await page.goto('/joined');
  await expect(page).toHaveTitle('You’re on the list · Machine Literate');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://machineliterate.org/joined');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://machineliterate.org/joined');
  await expect(page.locator('.site-nav [aria-current]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re on the list.');
  await expect(page.locator('main')).toContainText('We’ll email you when lessons open.');
  expect(await page.locator('head script[src="assets/ga.js"], head script[src="assets/joined.js"]').evaluateAll(scripts => scripts.map(script => [script.getAttribute('src'), script.defer]))).toEqual([['assets/ga.js', true], ['assets/joined.js', true]]);
  expect(readFileSync(new URL('../public/assets/waitlist.js', import.meta.url), 'utf8')).not.toContain('mlTrack');
  await page.getByRole('link', { name: 'Back to Machine Literate' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('direct production visit to joined does not emit signup events', async ({ page, request, baseURL }) => {
  await production(page, request, baseURL);
  await page.goto('https://machineliterate.org/joined');
  expect((await commands(page)).filter(entry => entry[0] === 'event')).toEqual([]);
  await expect(page.locator('.joined-email')).toBeHidden();
});

for (const role of ['parent', 'teacher', 'student', 'other', 'invalid', 'private@example.com']) {
  test(`joined fallback validates and consumes role: ${role}`, async ({ page, request, baseURL }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } }); });
    await production(page, request, baseURL);
    await page.goto(`https://machineliterate.org/joined?role=${encodeURIComponent(role)}#main`);
    await expect(page).toHaveURL('https://machineliterate.org/joined#main');
    const expected = ['parent', 'teacher', 'student', 'other'].includes(role)
      ? [['event', 'waitlist_signup', { role, send_to: 'G-VY51YYZ1TL' }]] : [];
    expect((await commands(page)).filter(entry => entry[0] === 'event')).toEqual(expected);
    await expect(page.locator('.joined-email')).toBeHidden();
    await page.reload();
    expect((await commands(page)).filter(entry => entry[0] === 'event')).toEqual([]);
  });
}

test('invalid stored role is consumed without tracking or exposing an address', async ({ page, request, baseURL }) => {
  await production(page, request, baseURL);
  await page.goto('https://machineliterate.org/');
  await page.evaluate(() => {
    sessionStorage.setItem('ml-joined', 'private@example.com');
    sessionStorage.setItem('ml-joined-email', 'private@example.com');
  });
  await page.goto('https://machineliterate.org/joined');
  expect((await commands(page)).filter(entry => entry[0] === 'event')).toEqual([]);
  expect(JSON.stringify(await commands(page))).not.toContain('private@example.com');
  await expect(page.locator('.joined-email')).toBeHidden();
  expect(await page.evaluate(() => [sessionStorage.getItem('ml-joined'), sessionStorage.getItem('ml-joined-email')])).toEqual([null, null]);
});

test('address is local text only and long addresses cannot overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  const email = '<img src=x onerror=alert(1)>' + 'a'.repeat(230) + '@example.com';
  await page.evaluate(email => {
    sessionStorage.setItem('ml-joined', 'parent');
    sessionStorage.setItem('ml-joined-email', email);
  }, email);
  await page.goto('/joined');
  await expect(page.locator('.wl-addr')).toHaveText(email);
  await expect(page.locator('.wl-addr img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => sessionStorage.getItem('ml-joined-email'))).toBeNull();
});

test('native waitlist works without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL + '/');
  await page.fill('#wl-email', 'parent@example.com');
  await page.locator('#waitlist button[type=submit]').click();
  await expect(page).toHaveURL(baseURL + '/joined');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re on the list.');
  await expect(page.locator('.joined-email')).toBeHidden();
  expect(await context.cookies()).toEqual([]);
  await context.close();
});
