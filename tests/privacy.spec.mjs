import { readdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const pages = readdirSync(new URL('../public/', import.meta.url)).filter(name => name.endsWith('.html')).sort();

for (const width of [360, 390]) {
  test(`every footer keeps its domains and a working Privacy link @ ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of pages) {
      await page.goto(`/${path}`);
      await page.evaluate(() => document.fonts.ready);
      const footer = page.locator('footer');
      const link = footer.getByRole('link', { name: 'Privacy', exact: true });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', '/privacy');
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      // At these phone widths each domain itself fits a line; the pair can wrap.
      const domainLayout = await footer.locator('.footer-domains span').evaluate(span => {
        const range = document.createRange();
        range.selectNodeContents(span);
        return [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right }));
      });
      expect(domainLayout.length).toBeLessThanOrEqual(2);
      for (const rect of domainLayout) {
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(width);
      }
      await link.click();
      await expect(page).toHaveURL(/\/privacy$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://machineliterate.org/privacy');
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://machineliterate.org/privacy');
      await expect(page.locator('.site-nav [aria-current=page]')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('privacy explains stored signup fields and the public contact address', async ({ page }) => {
  await page.goto('/privacy');
  const main = page.locator('main');
  for (const text of ['November 11, 2026', 'Machine Literate, Inc.', '501(c)(3)', '43-2331175',
    '845 United Nations Plaza, Apt 10A, New York, NY 10017', 'under 13 or 13+',
    'signup number', 'date and time', 'Vercel Web Analytics', 'Google Analytics',
    'does not set cookies', 'We do not send names or email addresses', 'There are no ads', 'remove a child’s info']) {
    await expect(main).toContainText(text);
  }
  await expect(main.getByRole('link', { name: 'volunteer@machineliterate.org' })).toHaveAttribute('href', 'mailto:volunteer@machineliterate.org');
  await expect(main.getByRole('link', { name: 'Google’s privacy policy' })).toHaveAttribute('href', 'https://policies.google.com/privacy');
});
