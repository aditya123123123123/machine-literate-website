// Page checks that run on every pull request (Chromium + WebKit).
// Ported from the launch QA scripts: layout, the demo lesson and the waitlist form.
import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';

const WIDTHS = [1440, 1024, 768, 390, 320];
const PAGES = readdirSync(new URL('../public/', import.meta.url)).filter(name => name.endsWith('.html')).sort()
  .map(name => name === 'index.html' ? '/' : `/${name.slice(0, -5)}`);

function watch(page, origin) {
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('data:')) problems.push(`external request: ${u}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  return problems;
}

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`layout ${path} @ ${width}px`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      const problems = watch(page, baseURL);
      await page.goto(path, { waitUntil: 'networkidle' });
      const r = await page.evaluate(async () => {
        await document.fonts.ready;
        // Exercise below-fold lazy assets before checking load failures.
        // networkidle alone does not request images outside the viewport.
        await Promise.all([...document.images].map(async image => {
          image.loading = 'eager';
          await image.decode().catch(() => {});
        }));
        const text = document.body.innerText;
        const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          h1: document.querySelectorAll('h1').length,
          emDash: text.includes('\u2014'),
          dupIds: ids.filter((v, i) => ids.indexOf(v) !== i),
          fonts: [document.fonts.check('600 20px "Bricolage Grotesque"'), document.fonts.check('16px Inter')],
          brokenImages: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src),
        };
      });
      expect(r.overflow, 'no horizontal scrolling').toBeLessThanOrEqual(0);
      expect(r.h1, 'exactly one h1').toBe(1);
      expect(r.emDash, 'no em dashes in page copy').toBe(false);
      expect(r.dupIds, 'no duplicate ids').toEqual([]);
      expect(r.fonts, 'brand fonts load').toEqual([true, true]);
      expect(r.brokenImages).toEqual([]);
      expect(problems).toEqual([]);
    });
  }
}

test('homepage headline and metadata', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Free AI lessons for kids.');
  await expect(page).toHaveTitle(/Free AI lessons/);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://machineliterate.org/');
});

test('site-wide audience covers grades 5–12 while preserving lesson bands', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
      await expect(page.locator(selector)).toHaveAttribute('content', /grades 5–12/);
    }
    // Grades 5–8 is valid only within the named Foundations course band.
    await expect(page.locator('body')).toContainText(/grades 5–12/i);
  }
  await page.goto('/get-involved');
  await expect(page.locator('.role').filter({ has: page.getByRole('heading', { name: 'Teachers', exact: true }) })).toContainText('grades 5–12');
  await expect(page.locator('.role').filter({ has: page.getByRole('heading', { name: 'Testers', exact: true }) })).toContainText('grades 5–12');
  await page.goto('/');
  await expect(page.locator('.hero-copy > .status-pill')).toHaveText('In development · Free · Grades 5–12');
  await expect(page.locator('.note-4')).toContainText('Built for grades 5–12.');
  await expect(page.locator('.audience .grade')).toHaveText(['5–8', '9–12']);
});

test('demo lesson: right answer, feedback, try again', async ({ page }) => {
  await page.goto('/');
  const check = page.locator('#check-answer');
  await expect(check).toBeDisabled();
  await page.click('[data-shape="black-triangle"]');
  await check.click();
  await expect(page.locator('#demo-feedback')).toContainText('throws it off');
  const retry = page.locator('#try-again');
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.locator('#demo-feedback')).toHaveText('');
  await expect(check).toBeDisabled();
  await page.click('[data-shape="yellow-triangle"]');
  await check.click();
  await expect(page.locator('#demo-feedback')).toContainText('Not quite');
});

test.describe('waitlist form', () => {
  for (const width of [1440, 390]) {
    test(`student age gate and success @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('.wl-age')).toBeHidden();
      await page.click('.wl-role >> text=Student');
      await expect(page.locator('.wl-age')).toBeVisible();

      await page.fill('#wl-email', 'kid@example.com');
      await page.click('.waitlist button[type=submit]');
      await expect(page.locator('.wl-msg')).toHaveText('Pick your age so we know where to send updates.');

      await page.click('text=Under 13');
      await expect(page.locator('#wl-email')).toHaveAttribute('placeholder', 'parent@email.com');
      await expect(page.locator('#wl-email-label')).toHaveText('Parent or guardian email');
      await expect(page.locator('#wl-note')).toContainText('parent or guardian');

      await page.click('.waitlist button[type=submit]');
      await expect(page.locator('.wl-success')).toContainText('You’re on the list.');
      await expect(page.locator('.wl-success')).toContainText('kid@example.com');
    });
  }

  test('switching away from Student hides the age question', async ({ page }) => {
    await page.goto('/');
    await page.click('.wl-role >> text=Student');
    await page.click('.wl-role >> text=Teacher');
    await expect(page.locator('.wl-age')).toBeHidden();
    await expect(page.locator('#wl-note')).toHaveText('Free. We’ll email you when lessons open.');
  });

  test('rejects an invalid email', async ({ page }) => {
    await page.goto('/');
    await page.fill('#wl-email', 'not-an-email');
    await page.locator('#wl-email').evaluate(el => el.removeAttribute('type'));
    await page.click('.waitlist button[type=submit]');
    await expect(page.locator('.wl-msg')).toHaveText('Enter a valid email address.');
    await expect(page.locator('#wl-email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('parent signup succeeds', async ({ page }) => {
    await page.goto('/');
    await page.fill('#wl-email', 'parent@example.com');
    await page.click('.waitlist button[type=submit]');
    await expect(page.locator('.wl-success')).toContainText('parent@example.com');
  });
});
