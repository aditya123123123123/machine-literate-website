import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const routes = [['/', 'Home'], ['/team', 'Team'], ['/impact', 'Impact'], ['/get-involved', 'Get involved']];

test('static headers remain synchronized', () => {
  const headers = ['index', 'team', 'impact', 'get-involved'].map(name =>
    readFileSync(new URL(`../public/${name}.html`, import.meta.url), 'utf8')
      .match(/<header.*?<\/header>/s)[0].replace(' aria-current="page"', ''));
  expect(new Set(headers).size).toBe(1);
});

for (const width of [1440, 390]) {
  test(`route navigation, back, metadata and active state @ ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const [route, label] of [...routes.slice(1), routes[0]]) {
      if (width < 801) await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route === '/' ? '/' : route}$`));
      await expect(page.locator('.site-nav [aria-current=page]')).toHaveText(label);
      await expect(page.locator('.site-nav [aria-current=page]')).toHaveCount(1);
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `https://machineliterate.org${route}`);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `https://machineliterate.org${route}`);
      if (width < 801) await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'false');
    }
    await page.goBack();
    await expect(page.locator('.site-nav [aria-current=page]')).toHaveText('Get involved');
  });
  for (const [route] of routes) {
    test(`axe accessibility ${route} @ ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ path: axePath });
      expect((await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))).violations).toEqual([]);
      if (width < 801) {
        await page.getByRole('button', { name: 'Menu' }).click();
        expect((await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))).violations).toEqual([]);
      }
    });
  }
}

test('mobile disclosure: keyboard, Escape, outside click, focus exit and resize', async ({ page, browserName }) => {
  // macOS WebKit uses Option+Tab for links with default system keyboard preferences.
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/team');
  await page.keyboard.press(tab);
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const toggle = page.getByRole('button', { name: 'Menu' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press(tab);
  await expect(page.locator('.site-nav a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.locator('.site-nav')).toBeHidden();
  await page.keyboard.press('Space');
  await page.locator('h1').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.locator('.site-nav a').last().focus();
  await page.keyboard.press(tab);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.locator('.site-nav a').first().focus();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.site-nav')).toBeVisible();
  // Wait for the desktop media-query event; the toggle is hidden at this width.
  await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(toggle).toBeFocused();
  await expect(page.locator('.site-nav')).toBeHidden();
  await toggle.click();
  await page.getByRole('navigation').getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page).toHaveURL(/\/#contact$/);
  await expect(page.locator('#contact')).toBeInViewport();
});

test('mobile navigation works with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);
  await expect(page.locator('.nav-toggle')).toBeHidden();
  await page.getByRole('navigation').getByRole('link', { name: 'Team', exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/team`);
  await page.getByRole('navigation').getByRole('link', { name: 'Impact', exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/impact`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await context.close();
});

test('team shows founder, leads and volunteers only', async ({ page }) => {
  await page.goto('/team');
  for (const title of ['Founder', 'Leads', 'Volunteers']) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Board of Directors' })).toHaveCount(0);
  await expect(page.locator('.person-card h3')).toHaveText(['Aditya Jhalani']);
  const founderPhoto = page.locator('.founder-group .photo-avatar img');
  await expect(founderPhoto).toHaveAttribute('src', 'assets/team/aditya-jhalani.jpg');
  await expect(founderPhoto).toHaveAttribute('alt', /Aditya Jhalani/);
  expect(await founderPhoto.evaluate((img) => img.complete && img.naturalWidth)).toBe(600);
  const text = await page.locator('main').innerText();
  for (const name of ['Juhee', 'Amit', 'Keith', 'Crystal', 'Director']) expect(text).not.toContain(name);
  const founderLinks = page.locator('.founder-group .person-links a');
  await expect(founderLinks).toHaveCount(3);
  await expect(founderLinks.nth(0)).toHaveAttribute('href', 'https://www.linkedin.com/in/aditya-jhalani-70b207367/');
  await expect(founderLinks.nth(1)).toHaveAttribute('href', 'mailto:aditya@machineliterate.org');
  await expect(founderLinks.nth(2)).toHaveAttribute('href', 'https://www.adityajhalani.com/');
  for (const name of ['LinkedIn', 'Email aditya@machineliterate.org', 'Personal website']) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  }
  for (const link of await founderLinks.all()) {
    const box = await link.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('.leads-group .open-seat')).toHaveCount(3);
  await expect(page.locator('.volunteers-group .open-seat')).toHaveCount(3);
  for (const link of await page.locator('.open-seat a').all()) await expect(link).toHaveAttribute('href', '/get-involved');
  await expect(page.locator('.open-seat').last()).toContainText('2 open seats');
  await expect(page.locator('.open-intro')).toContainText('adults 18+');
  await expect(page.locator('.open-intro')).toContainText('Unpaid, with a bounded scope');
  await page.getByRole('link', { name: 'Skip past the team' }).click();
  await expect(page.locator('#join-team')).toBeInViewport();
  await expect(page.locator('#join-team')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Join the team' })).toHaveAttribute('href', '/get-involved');
});

test('partner tabs support arrows, wrapping, Home, End, click and roving focus', async ({ page, browserName }) => {
  await page.goto('/impact');
  const tabs = page.getByRole('tab');
  await expect(page.getByRole('tablist', { name: 'Partner opportunities' })).toBeVisible();
  await expect(tabs).toHaveCount(3);
  await tabs.first().focus();
  for (const [key, index] of [['ArrowRight', 1], ['ArrowRight', 2], ['ArrowRight', 0], ['ArrowLeft', 2], ['Home', 0], ['End', 2]]) {
    await page.keyboard.press(key);
    await expect(tabs.nth(index)).toBeFocused();
    await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(index)).toHaveAttribute('tabindex', '0');
    await expect(page.locator('[role=tab][tabindex="0"]')).toHaveCount(1);
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', await tabs.nth(index).getAttribute('id'));
  }
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.getByRole('tabpanel')).toBeFocused();
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Founding educator collaborators');
  await page.addScriptTag({ path: axePath });
  for (const tab of await tabs.all()) {
    await tab.click();
    expect((await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))).violations).toEqual([]);
  }
});

test('partner invitations remain visible without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/impact`);
  await expect(page.locator('.partner-tabs')).toBeHidden();
  for (const panel of await page.locator('.partner-panel').all()) await expect(panel).toBeVisible();
  for (const title of ['Schools', 'Educators', 'Organizations']) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await context.close();
});

test('draft claims, measurement safeguards, future events and demo anchor', async ({ page }) => {
  for (const route of ['/team', '/impact']) {
    await page.goto(route);
    // Page copy makes no impact/funding claims. The verified 501(c)(3) status lives only in the legal footer.
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/501\(c\)\(3\)|students impacted|testimon|award|tax.exempt|funded by/i);
  }
  await expect(page.locator('.scope-band')).toContainText('PLANNED PROGRAM SCOPE');
  await expect(page.locator('.scope-grid dd')).toHaveText(['2', '24', '5–12', 'Free']);
  await expect(page.locator('.editorial-list dt')).toHaveText(['Explain a change', 'Show the evidence', 'Make a considered choice', 'Improve the experience']);
  await expect(page.locator('.editorial-list')).toContainText('appropriate consent and privacy safeguards');
  await expect(page.locator('.next-grid .seat-label')).toHaveText(['PLANNED · NOT YET SCHEDULED', 'PLANNED · NOT YET SCHEDULED']);
  await page.getByRole('link', { name: 'Try the demo' }).click();
  await expect(page).toHaveURL(/\/#demo-prompt$/);
  await expect(page.locator('#demo-prompt')).toBeInViewport();
});

test('founder pilot stays separate from planned courses and partner invitations', async ({ page }) => {
  await page.goto('/impact');
  const origin = page.getByRole('region', { name: 'Where it started.' });
  await expect(origin).toBeVisible();
  await expect(origin).toContainText('40 incoming ninth graders');
  await expect(origin).toContainText('8 lessons');
  await expect(origin).toContainText('founder’s pilot class');
  await expect(origin).toContainText('not the two 12-lesson courses');
  await expect(origin).not.toContainText(/partner|endorse|about 40/i);
  await expect(page.locator('.partners-section')).not.toContainText('Breakthrough');
  await expect(page.locator('.partners-section')).toContainText('We don’t have partners yet.');
  const milestones = page.locator('.milestone-grid article');
  await expect(milestones.first()).toContainText('SUMMER 2026');
  await expect(milestones.first()).toContainText('Breakthrough New York');
  await expect(milestones.nth(1)).toContainText('October 9, 2026');
  const images = origin.locator('img');
  await expect(images).toHaveCount(3);
  for (const image of await images.all()) {
    await expect(image).toHaveAttribute('alt', /\S+/);
    await expect(image).toHaveAttribute('width', '1600');
    await expect(image).toHaveAttribute('height', '1200');
    await expect(image).toHaveAttribute('loading', 'lazy');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  await expect(origin.locator('figcaption')).toHaveCount(0);
});

test('pilot web photos contain no EXIF or XMP metadata', () => {
  for (const name of ['student-discussion', 'ai-request-comparison', 'ai-judgment-discussion']) {
    const jpeg = readFileSync(new URL(`../public/assets/breakthrough/${name}.jpg`, import.meta.url));
    expect(jpeg.includes(Buffer.from('Exif\0\0'))).toBe(false);
    expect(jpeg.includes(Buffer.from('http://ns.adobe.com/xap/1.0/'))).toBe(false);
  }
});

test('redesigned pages respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/team', '/impact']) {
    await page.goto(route);
    expect(await page.evaluate(() => [...document.querySelectorAll('main *')].every(el => getComputedStyle(el).animationName === 'none' && getComputedStyle(el).transitionDuration === '0s'))).toBe(true);
  }
});

test('new pages are honest draft content and sitemap routes resolve', async ({ page, request }) => {
  await page.goto('/impact');
  await expect(page.locator('.page-hero .status-pill')).toContainText('Not yet open to students');
  await expect(page.locator('.milestone-grid')).toContainText('Two 12-lesson course plans authored');
  await expect(page.locator('.course-grid article').first()).toContainText('Grades 5–8');
  await expect(page.locator('.course-grid article').last()).toContainText('Grades 9–12');
  await expect(page.locator('.section-heading')).toContainText('Neither course requires coding or completion of the other.');
  await page.goto('/team');
  await expect(page.locator('.open-intro')).toContainText('not yet open to students');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const [route] of routes) {
    expect(sitemap).toContain(`https://machineliterate.org${route}`);
    expect((await request.get(route)).status()).toBe(200);
  }
  expect((await request.get('/README.md')).status()).toBe(404);
  expect((await request.get('/impact')).headers()['x-robots-tag']).toBe('noindex, nofollow');
  expect(await (await request.get('/robots.txt')).text()).toBe('User-agent: *\nDisallow: /\n');
  expect((await request.get('/api/unknown')).status()).toBe(404);
  const signup = await request.post('/api/waitlist', {
    headers: { Accept: 'application/json' },
    data: { email: 'local-preview@example.com', role: 'parent' },
  });
  expect(await signup.json()).toEqual({ ok: true, dryRun: true });
});

test('public contact links use the volunteer@ org address, never Gmail', async ({ page }) => {
  for (const path of ['/', '/get-involved']) {
    await page.goto(path);
    const mailtos = page.locator('a[href^="mailto:"]');
    expect(await mailtos.count()).toBeGreaterThan(0);
    for (const href of await mailtos.evaluateAll(as => as.map(a => a.getAttribute('href')))) {
      expect(href).toMatch(/^mailto:volunteer@machineliterate\.org(\?|$)/);
    }
    await expect(page.locator('body')).not.toContainText('gmail.com');
  }
});

test('every page footer shows legal name, EIN and mailing address', async ({ page }) => {
  for (const path of ['/', '/team', '/impact', '/get-involved']) {
    await page.goto(path);
    const footer = page.locator('footer.site-footer');
    await expect(footer).toContainText('Machine Literate, Inc.');
    await expect(footer).toContainText('EIN 43-2331175');
    await expect(footer).toContainText('501(c)(3) nonprofit');
    await expect(footer.locator('address')).toHaveText('845 United Nations Plaza, Apt 10A, New York, NY 10017', { useInnerText: false });
  }
});

test('homepage states the mission; every footer names both official domains', async ({ page }) => {
  await page.goto('/');
  const mission = page.locator('#mission');
  await expect(mission.getByRole('heading', { level: 2 })).toHaveText('Help every student understand the AI around them.');
  await expect(mission).toContainText('Machine Literate is a nonprofit.');
  for (const path of ['/', '/team', '/impact', '/get-involved']) {
    await page.goto(path);
    await expect(page.locator('footer .footer-domains')).toHaveText('Official websites: machineliterate.org and machineliterate.com');
  }
});
