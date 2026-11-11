import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

const asset = name => readFileSync(new URL(`../public/assets/${name}`, import.meta.url), 'utf8');

test('logo is byte-identical to the existing browser favicon', () => {
  expect(asset('mark.svg')).toBe(asset('favicon.svg'));
  expect(asset('mark.svg')).toContain('viewBox="0 0 180 180"');
  expect(asset('mark.svg')).toContain('<rect width="180" height="180" rx="36" fill="#FFD84D"/>');
});

const pages = readdirSync(new URL('../public/', import.meta.url)).filter(name => name.endsWith('.html')).sort();
for (const name of pages) {
  const route = name === 'index.html' ? '/' : `/${name.slice(0, -5)}`;
  for (const width of [320, 390, 1024, 1440]) {
    test(`robot logo fits header ${route} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      const logo = page.locator('.site-header .wordmark img');
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute('src', 'assets/mark.svg');
      const result = await logo.evaluate(img => {
        const box = img.getBoundingClientRect();
        const header = img.closest('.site-header').getBoundingClientRect();
        const wordmark = img.closest('.wordmark');
        const text = wordmark.querySelector('span').getBoundingClientRect();
        return {
          loaded: img.complete && img.naturalWidth > 0,
          square: box.width === box.height,
          inside: box.left >= 0 && box.right <= innerWidth && box.top >= header.top && box.bottom <= header.bottom,
          noTextOverlap: box.right <= text.left,
          font: getComputedStyle(wordmark).fontFamily,
          highlight: getComputedStyle(wordmark.querySelector('mark')).backgroundColor,
        };
      });
      expect(result.loaded && result.square && result.inside && result.noTextOverlap).toBe(true);
      expect(result.font).toContain('Bricolage Grotesque');
      expect(result.highlight).toBe('rgb(255, 216, 77)');
    });
  }
}
