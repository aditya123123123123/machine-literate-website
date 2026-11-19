import { test, expect } from '@playwright/test';

async function fill(page) {
  await page.fill('#vol-name', 'Private Volunteer');
  await page.fill('#vol-email', 'private@example.com');
  await page.fill('#vol-note', 'Private note');
  await page.check('#vol-age');
}
test('role links preselect the form; age gate, dry-run success and focus at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/get-involved');
  for (const role of ['teacher', 'tester', 'lesson writer', 'web and design', 'tutor']) {
    await page.locator(`[data-volunteer-role="${role}"]`).click();
    await expect(page.locator('#vol-role')).toHaveValue(role);
  }
  await page.locator('#volunteer-form button').click();
  await expect(page.locator('.wl-msg')).toContainText('Under 13? Ask a parent or guardian');
  await expect(page.locator('#vol-age')).toBeFocused();
  await fill(page);
  const response = page.waitForResponse('**/api/volunteer');
  await page.locator('#volunteer-form button').click();
  expect(await (await response).json()).toEqual({ ok: true, dryRun: true });
  await expect(page.locator('#volunteer-thanks')).toBeVisible();
  await expect(page.locator('#volunteer-thanks')).toBeFocused();
  await expect(page.locator('#volunteer-form')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
test('volunteer validation and failed requests can be retried without tracking', async ({ page }) => {
  await page.goto('/get-involved');
  await fill(page);
  await page.fill('#vol-email', 'invalid');
  await page.locator('#volunteer-form button').click();
  await expect(page.locator('.wl-msg')).toHaveText('Enter a valid email address.');
  await expect(page.locator('#vol-email')).toBeFocused();
  await page.fill('#vol-email', 'private@example.com');
  await page.evaluate(() => { window.events = []; window.mlTrack = (...args) => window.events.push(args); });
  await page.route('**/api/volunteer', route => route.fulfill({ status: 500, json: { ok: false } }));
  await page.locator('#volunteer-form button').click();
  await expect(page.locator('.wl-msg')).toContainText('That didn’t go through');
  expect(await page.evaluate(() => window.events)).toEqual([]);
  await page.unroute('**/api/volunteer');
  await page.locator('#volunteer-form button').click();
  await expect(page.locator('#volunteer-thanks')).toBeVisible();
  expect(await page.evaluate(() => window.events)).toEqual([['volunteer_signup', { role: 'other' }]]);
});
test('volunteer works with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/get-involved`);
  await fill(page);
  await page.locator('#volunteer-form button').click();
  await expect(page).toHaveURL(/get-involved\?joined=1#volunteer-thanks$/);
  await expect(page.locator('#volunteer-thanks')).toBeVisible();
  await expect(page.locator('#volunteer-form')).toBeHidden();
  await context.close();
});
for (const width of [390, 1440]) test(`volunteer accessibility at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/get-involved');
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  expect(await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations)).toEqual([]);
});
