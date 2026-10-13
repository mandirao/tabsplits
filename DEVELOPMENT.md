# Development: cold start

How to pick Tab-Splits back up after a break, in a person's or a Claude Code session, without touching production.

> [!WARNING]
> **A push to `main` deploys to production.** Vercel's GitHub integration deploys every push to `main` of `mandirao/tabsplits` to www.tabsplits.com, even a docs-only change. Never commit directly to `main`. Work on a branch, and merge only when you've decided to ship.

## Ground rules

- **Never use production data for development or tests.** Use the synthetic receipt [`docs/screenshots/demo-receipt.png`](docs/screenshots/demo-receipt.png) and fictional diners.
- **Never point local code at the production database.** `npm run dev` and `npm run db:push` refuse to run when `DATABASE_URL` matches `PRODUCTION_SUPABASE_REF` in `.env` (see `scripts/guard-dev-db.mjs`). Keep that variable set.
- **Production changes go through `main` only**, after the checks below. Schema changes against production need a backup first and an explicit `ALLOW_PRODUCTION_DB=1` (a separate, deliberate step).

## 1. Orient (read-only, every session)

```sh
cd ~/Dev/tabsplits-public
git status && git branch --show-current     # expect a clean tree; you shouldn't be on main to edit
git fetch && git log --oneline -3 origin/main
git remote -v                               # origin = github.com/mandirao/tabsplits
npm ci
git switch -c <feature-branch>              # start every change on a branch
```

## 2. Choose your path

### Path A: no database needed (most changes)

Docs, README, split math (`shared/splitMath.ts`), validation, server logic covered by tests, and type-level or copy changes. These run without any database: the tests use in-memory Postgres (PGlite) and ignore `DATABASE_URL`.

```sh
npm test                 # 28+ tests: split math, image access rules, transactional writes
npm run check            # typecheck
npm run build:vercel     # the same build Vercel runs
```

If all three pass and you don't need to see the running app, skip to step 4.

### Path B: you need the running app (UI changes, flows, screenshots)

The app server needs a real Postgres plus Supabase Storage. Use an **isolated development project**, never production. As of October 2026 the Supabase org is on the Pro plan, so a dev project costs about $10/month while it exists and can't be paused in place. The cheapest approach is to recreate it when needed and delete it afterwards. It only ever holds synthetic data.

**Recreate the dev environment (about 10 minutes):**

1. **Log in.** In a normal Terminal window (not inside Claude Code), run `npx -y supabase@2.120.0 login` and finish in the browser.
2. **Create the project:** `npx -y supabase@2.120.0 projects create tabsplits-dev --org-id <org-id> --region ca-central-1 --size micro --db-password <generated>`. `npx -y supabase@2.120.0 orgs list` shows the org ID.
3. **Create the bucket:** a **private** Storage bucket named `receipts`, from the dashboard or the Storage API with the dev secret key.
4. **Fill in `.env`** from `.env.example`. Use the dev project's transaction-pooler URL for `DATABASE_URL` (new projects may sit on `aws-1-ca-central-1.pooler.supabase.com:6543`), its `SUPABASE_URL`, and its secret key. Also set a fresh `SESSION_SECRET`, the OpenAI key, and `PRODUCTION_SUPABASE_REF` (the production project's ref). Never paste these values into a chat.
5. **Check the guard and create the tables:**
   ```sh
   set -a; source .env; set +a
   node scripts/guard-dev-db.mjs     # must not report PRODUCTION
   npm run db:push                   # creates tables in the dev database only
   ```
6. **Run it.** `PORT=5055 npm run dev`, then open http://localhost:5055. Port 5000 is taken by macOS AirPlay. Sign up with a throwaway `@example.com` account and scan `demo-receipt.png`.

**Preview deployments** (every non-`main` branch push) use Vercel's *Preview* environment variables. Point them at the current dev project whenever you recreate it, and leave *Production* alone. If the dev project is deleted, Preview builds still succeed but the app can't reach a database. That's harmless, and it can't touch production.

**When you're done:** delete `tabsplits-dev` (dashboard → Project Settings → General) to stop billing. Nothing in it is worth keeping.

## 3. Verify before merging

- Path A checks pass (`npm test`, `npm run check`, `npm run build:vercel`).
- For UI or flow changes: push the branch and check its Preview URL (it's behind Vercel login, which is expected), or the local app on the dev database.
- Confirm no real diner data appears in anything you commit (screenshots, fixtures, logs).

## 4. Ship (only when ready)

1. **Back up production first** if the change touches data or the schema (see [`docs/environments.md`](docs/environments.md)).
2. Merge the branch into `main` (a PR on GitHub, or locally then `git push origin main`). **This deploys to production.**
3. Smoke-check www.tabsplits.com: the site loads, sign-in works, an existing share link opens, and its receipt photo opens through the link.
4. If anything is wrong, roll back in Vercel (Deployments → previous production deployment → Promote / Instant Rollback, or `vercel rollback`), then investigate on a branch.

## Notes for a Claude Code session

- Start with step 1 and report what you find. Don't edit on `main`.
- Path A needs no credentials. Path B needs the person to run the Supabase login, and approval before creating cloud resources, changing Vercel environment variables, deploying, or touching production.
- Read secrets from `.env` without printing them.
