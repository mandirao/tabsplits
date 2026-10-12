# Environments

Three environments, and only production touches real receipts.

| Environment | Runs | Should use |
|---|---|---|
| Local dev | `npm run dev` on your machine | **Development** Supabase project, via `.env` |
| Vercel Preview | Every non-`main` branch and PR | **Development** Supabase project, via Vercel *Preview* env vars |
| Vercel Production | `main`, via Vercel's GitHub integration | **Production** Supabase project, via Vercel *Production* env vars |

Automated tests (`npm test`) never use any of these. They run against in-memory Postgres (PGlite) and unset `DATABASE_URL` before running.

## Safeguards in this repo

- `scripts/guard-dev-db.mjs` runs before `npm run dev` and `npm run db:push`. It exits if `DATABASE_URL` points at the project named in `PRODUCTION_SUPABASE_REF`. Override deliberately with `ALLOW_PRODUCTION_DB=1`.
- `.env` is git-ignored; `.env.example` holds placeholders only.
- Production refuses to start without `SESSION_SECRET`.

## One-time setup: development project

1. **Supabase:** create a new project (e.g. `tabsplits-dev`) on the free tier. Then:
   - create a **private** Storage bucket named `receipts`;
   - copy the project URL, the service-role key, and the **transaction pooler** connection string.
2. **Local `.env`:** copy `.env.example` and fill in the *development* values. Set `PRODUCTION_SUPABASE_REF` to the production project's ref. Then create the schema:
   ```sh
   set -a; source .env; set +a; npm run db:push
   ```
   The session table is created automatically on first run.
3. **Vercel Preview:** in Project → Settings → Environment Variables, give the **Preview** environment the *development* values for `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a distinct `SESSION_SECRET`. Leave **Production** values unchanged. The variables are marked sensitive, so they can't be read back afterwards; check them before saving.
4. **Seed demo data** through the app itself (sign up, scan a synthetic receipt). Never copy production rows into development.

## Before deploying to production: backup

Take a restorable backup first. The Supabase free tier has no downloadable backups.

```sh
brew install libpq   # provides pg_dump / pg_restore
# Use the production SESSION-mode connection string (port 5432), not the transaction pooler.
pg_dump --format=custom --no-owner --file tabsplits-prod-$(date +%F).dump "<production session-mode URI>"
pg_restore --list tabsplits-prod-$(date +%F).dump | head   # confirm it's readable
```

Store the dump encrypted and outside the repo. It contains diners' names and phone numbers. Receipt images live in Supabase Storage and aren't included. To restore into a scratch database for checking: `pg_restore --no-owner -d "<scratch URI>" tabsplits-prod-<date>.dump`.
