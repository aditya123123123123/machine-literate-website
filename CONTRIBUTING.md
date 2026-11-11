# Contributing

Thanks for helping build Machine Literate. This guide covers how to get set up, how to make a change and how it reaches the live site.

## Branches

| Branch | What it is | Who merges |
| --- | --- | --- |
| `main` | What's live on machineliterate.org | Maintainers only, via release PR from `preprod` |
| `preprod` | Staging. All work lands here first | Maintainers, after review |
| `feature/…`, `fix/…`, `docs/…`, `refactor/…` | Your work | You open the PR |

Both `main` and `preprod` are protected: changes need a pull request, a passing test run and an approving review.

## Making a change

**1. Get the code.** If you're on the team, clone the repo directly. Otherwise, fork it first and clone your fork.

```bash
git clone https://github.com/aditya123123123123/machine-literate-coming-soon.git
cd machine-literate-coming-soon
npm install
npx playwright install chromium webkit   # first time only
```

**2. Branch off `preprod`.**

```bash
git checkout preprod
git pull
git checkout -b fix/waitlist-error-text
```

Name the branch `type/short-description`: `feature/`, `fix/`, `docs/`, `refactor/` or `chore/`.

**3. Make your change and check it.**

```bash
npm run dev   # http://localhost:3000
npm test
```

Check your change on a phone-width window too (390px is a good default). Most visitors are on phones.

**4. Commit and push.** Keep commits focused, with a short message that says what changed: `Fix waitlist error text on small screens`.

```bash
git push -u origin fix/waitlist-error-text
```

**5. Open a pull request into `preprod`** (not `main`). Fill in the template. Within a few minutes you'll see:

- **CI / Tests**: the automated checks. They must pass before merging.
- **Vercel**: a preview link with your change deployed. Put it in the PR and use it to double-check your work.

**6. Review.** A maintainer will review it, may ask for changes, then merge it into `preprod`.

## Releases

When `preprod` has a set of changes ready, a maintainer opens a PR titled `Release vX.Y (preprod -> main)` listing what's included. Merging it deploys to machineliterate.org within about a minute.

If something breaks in production, a maintainer can roll back instantly from the Vercel dashboard while a fix goes through the normal flow.

Don't use **Promote to Production** or **Redeploy to Production** on a preview build in Vercel. That skips review, and the build will fail on purpose: `deploy/production-guard.mjs` only lets production build from `main`.

## Ground rules for the site

- **Kids use this site.** Copy should be plain, friendly and readable at a 5th-grade level. No tracking scripts, analytics or third-party embeds without a maintainer's sign-off. Google Analytics 4 (cookieless consent mode, no Google signals/ad personalization, production hostname only) approved by maintainer on 2026-11-11; any other tracking still needs sign-off.
- **No external requests in local pages or previews.** Fonts and images are self-hosted. GA4 runs only on `machineliterate.org` and `www.machineliterate.org`; local page tests still fail on external requests. Production-simulation tests intercept Google’s script with a harmless stub. Keep consent denied for all four storage/advertising settings, and send only the selected role in `waitlist_signup`, never email, age or free text. Vercel Web Analytics remains enabled through its same-origin script.
- **Accessibility matters.** Use real buttons and labels, keep keyboard focus visible and give images meaningful alt text (or `aria-hidden` if decorative).
- **Brand.** Ink `#1F2328` and highlighter yellow `#FFD84D`; headings in Bricolage Grotesque, body in Inter. Don't add new colors or fonts without discussing it in an issue first.
- **No em dashes** in page copy (the tests check this).
- **Never commit secrets.** No `.env` files, API keys or database URLs. You don't need any to work on the site.
- **The waitlist stores children's and parents' emails.** Changes to `api/waitlist.js` or the form need a maintainer's review and must keep the under-13 parent-email flow intact.

## Reporting bugs and ideas

Use the [issue templates](https://github.com/aditya123123123123/machine-literate-coming-soon/issues/new/choose). Look for issues labelled `good first issue` if you're new.

For security problems, don't open a public issue. Email volunteer@machineliterate.org instead.
