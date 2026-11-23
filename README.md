# Machine Literate website

Source for [machineliterate.org](https://machineliterate.org): free AI lessons for kids in grades 5–12.

It's a plain static site (HTML, CSS, a little JavaScript) plus serverless functions for waitlist and volunteer signups. No framework, no build step.

```
public/          Everything the browser sees (index.html, team.html, impact.html, get-involved.html, styles.css, assets/)
api/waitlist.js  Waitlist signup endpoint (Vercel serverless function)
api/volunteer.js Volunteer signup endpoint (13 or older)
tests/           Automated checks that run on every pull request
scripts/         Local dev server and admin helpers
vercel.json      Hosting config (clean URLs, security headers)
deploy/          Build check: production only builds from main
```

## Run it locally

You need [Node.js 24](https://nodejs.org).

```bash
git clone https://github.com/aditya123123123123/machine-literate-coming-soon.git
cd machine-literate-coming-soon
npm install
npm run dev        # http://localhost:3000
```

Locally the waitlist and volunteer forms work end to end, but it runs in **dry-run mode**: it validates and shows the success message without saving anything. Only the production site writes to the real waitlist, so you never need database credentials.

## Run the tests

```bash
npx playwright install chromium webkit   # first time only
npm test
```

This runs the API tests and the page checks (layout at four screen widths, the demo lesson and the waitlist form) in Chromium and WebKit. The same tests run automatically on every pull request.

## Team and Impact pages

The site serves grades 5–12: Foundations (5–8) and Investigations (9–12) are independent entry points, not a sequence. `/team` introduces the founder and volunteer work areas. `/impact` describes planned learning outcomes and the founder’s summer 2026 Breakthrough New York pilot (40 students, 8 lessons), separate from the planned courses. The courses remain in development and are not yet open to students.

All four pages share responsive, keyboard-accessible navigation that also works without JavaScript. The local preview server binds only to loopback, forces waitlist dry-run mode, and discourages indexing; production robots and hosting configuration are unchanged.

## How changes get to the live site

```
your branch ──PR──▶ preprod ──release PR──▶ main ──▶ machineliterate.org
                     │                       
                     └─ preview link on every PR
```

1. Branch off `preprod` and open a pull request back into `preprod`.
2. GitHub runs the tests, and Vercel posts a preview link on the PR so you can see your change live.
3. A maintainer reviews and merges into `preprod`.
4. When `preprod` is ready, a maintainer opens a release PR from `preprod` to `main`. Merging into `main` deploys to machineliterate.org.

Nobody pushes straight to `main` or `preprod`. Vercel builds every branch automatically, so you never deploy by hand.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

## Signup measurement and volunteer data

Google Analytics runs only on `machineliterate.org` and `www.machineliterate.org`. All four consent settings start denied. Analytics cookies need an explicit Allow; Cookie settings revokes that grant and removes GA cookies. Advertising storage and personalization always stay denied.

For visits with `gclid`, `gbraid` or `wbraid`, `ml-ad-visit=1` in sessionStorage remembers the ad visit within the tab. Only these visits grant `ad_user_data` and enable URL passthrough for click IDs, even if analytics cookies are declined. Google Ads uses imported GA4 key events for conversion measurement; there is no separate AW tag or conversion event. No `ads_data_redaction` setting is applied. Signup analytics sends only an allowlisted role, never name, email, age or note. This configuration does not itself verify Google's attribution or bidding eligibility for a child-directed site.

`/api/volunteer` requires a name (100 characters), email (254), supported role and age-13 confirmation, with an optional note (500). It shares the waitlist's 2 KB body cap and honeypot. Only `VERCEL_ENV=production` writes to Neon; previews/local validate and return dry-run success. The `volunteers` table is created on first production signup. Duplicate emails are left unchanged. No-JS submissions redirect to a visible thank-you. Export with `node scripts/export-volunteers.mjs` using an authorized `DATABASE_URL`; exports contain personal data and must stay private.

## License

Code is under the [MIT License](LICENSE). Fonts are under the SIL Open Font License (see `public/licenses/`). The Machine Literate name, logo and robot mascot are not covered by the code license.
