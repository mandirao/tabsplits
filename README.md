# Tab-Splits

**Live app: [www.tabsplits.com](https://www.tabsplits.com)**

Tab-Splits turns a restaurant receipt into a fair, itemized tab for everyone at the table: scan the receipt, check what the AI read, assign or share each item, and send every diner a link showing exactly what they owe, with tax and tip included.

I built it for **Amuse-Bouche**, a Denver food collective I organize. I bring small groups of people together over restaurant meals, often people who've never met. They order different things and have different budgets, and settling up at the end of a lovely evening used to be the most awkward part of it. "Let's just split it evenly" quietly penalizes the person who ordered a soup and water. Doing the math properly on a phone at the table is slow and error-prone. Tab-Splits exists so the bill doesn't undo the friendships the dinner was meant to start.

I independently own the product: the problem, requirements, UX, technical tradeoffs, testing, and iteration. Most of the implementation code was generated with AI coding tools working under my direction (more in [How I built it](#how-i-built-it)).

---

## The experience

A guided flow takes the organizer from photo to shared tab:

1. **Scan.** Snap the receipt. GPT-4o vision extracts the restaurant, line items, subtotal, tax, and any auto-gratuity.
2. **Verify.** Review and correct what the AI read, next to the original photo. Items are auto-categorized (appetizer, meal, drink, dessert).
3. **Choose the meal format.** *Family Style* pre-assigns shared food to everyone. *Coursed* pre-assigns appetizers and desserts and leaves mains and drinks individual. *Mixed Bag* starts from scratch.
4. **Assign.** Step through items one at a time: who had it? Items can be split equally, or *by share* (e.g. two people had two drinks each, one had one).
5. **Tip, review, and who paid.** Set the tip and check each diner's itemized total before anything is sent.
6. **Share.** One read-only link (QR code or text message). Each diner taps their name and lands on their own tab: their items, their share of tax and tip, and a button that opens Venmo with the amount filled in.

<!-- Screenshots (synthetic data only, no real names, numbers, or receipts), e.g. in docs/screenshots/:
     1) verify step: extracted items beside a staged demo receipt photo
     2) "Who had a …?" assignment drawer showing Split by share
     3) organizer review of one diner's itemized total
     4) the diner's shared link on a phone: their items, tax/tip share, Venmo button -->

## Real-world use

Tab-Splits has been used at real Amuse-Bouche dinners since January 2026. From the production database (receipt totals, not money moved through the app, which processes no payments):

| | |
|---|---|
| Group dinners split | **10** bills between January and September 2026 |
| Restaurant bills split | **$4,017** in receipt totals |
| Diners | **17** distinct people, **45** diner-seats; typical table of 4–6 |
| Repeat participation | 9 of the 17 have been on two or more split bills |
| Beyond my own account | 5 other people created accounts; 2 have used it to split a group bill of their own |

### How it changed with use

The commit history (285 commits since November 2025) shows the product changing shape as it got used:

- **From an editing screen to a guided flow.** Early versions were a single receipt screen. In April 2026 it became a step-by-step wizard, refined through May (scan → verify → format → diners → assign → tip → review → paid by → share), so organizing a tab at the table means answering one question at a time.
- **Meal formats.** *Family Style*, *Coursed*, and *Mixed Bag* presets do the bulk of the assigning for typical group dinners, leaving only the genuinely individual items.
- **Split by share.** Not every shared item is shared evenly, so items can be weighted per person.
- **A review step before sharing.** The organizer checks each diner's total before anyone else sees it.
- **Sharing built for a dinner table.** QR codes and per-person text messages, a name picker instead of logins for diners, and Venmo deep links.
- **Receipt quirks.** Auto-gratuity and service charges are moved into the tip rather than treated as a dish, and duplicate lines (`2x Lychee Martini` + `1x Lychee Martini`) are merged.

## Product and technical decisions

**1. AI does the reading; a human signs off on the money.** Vision models misread receipts: a missed line, a per-unit price taken as a line total, a subtotal that silently includes gratuity. So extraction is a draft, never the answer. The prompt and post-processing pin down the ambiguous cases (`price` is always the line total; gratuity goes to tip; duplicates merge) in `server/routes.ts`. The organizer then verifies against the photo. If the items don't add up to the receipt subtotal, to the cent, the app says so and by how much, explains that individual amounts won't add up to the bill, and offers two optional fixes: correct the items, or adopt the item total as the subtotal. It warns rather than blocks. The organizer is at the table and knows things the receipt doesn't (a comped dish, a cash top-up), so they can still share. Diners see a matching note on their link, so a discrepancy is never silent.

**2. One source of truth for the math, and it reconciles to the cent.** Every screen (organizer view, review step, diner's link, settlement) computes per-person amounts with the same function, `getPersonTotals`. Tax and tip are split in proportion to what each person ordered, and every component is allocated in whole cents with a deterministic largest-remainder rule. Before that change, about 3 in 10 randomized test bills displayed per-person amounts that were off from the receipt total by a cent or so. Now, when every item is assigned and the items match the subtotal, the per-person amounts sum exactly to the receipt total, and a 3,000-receipt randomized test enforces it. When they don't match, the gap is shown to the organizer and diners rather than quietly absorbed.

**3. Diners get a link, not an account; the link reveals as little as possible.** Asking guests to sign up to see a $38 tab would recreate the friction the app exists to remove. A share link shows only the diners on that bill (names as the organizer entered them; never phone numbers or emails), the items, and the payer's Venmo handle. Receipt photos sit in a private bucket and are served only to the organizer, or to a viewer holding that receipt's share link (`server/objectAccess.ts`). Share links are stable, so a link already texted to the table keeps working if the organizer edits and re-shares.

**4. Engineering effort goes where money and privacy are involved, and nowhere else.** Re-scanning a receipt and deleting one each happen in a single database transaction, so a dropped connection can't leave a half-empty bill. Request logs record method, path, status, and timing, never response bodies. Production refuses to start without a real session secret. Just as deliberate is what's *not* here: no database indexes for scale it doesn't have, no error-tracking vendor, no major dependency upgrades for advisories that don't apply to how it's deployed. `BACKLOG.md` records those deferrals and why.

## How I built it

I started Tab-Splits in November 2025 on Replit using its AI agent, then moved it in July 2026 to GitHub + Vercel + Supabase and continued with Claude Code.

My role was product owner, designer, and technical lead, working through AI tools rather than writing most of the code by hand. Concretely, I:

- defined the problem and requirements from what I saw at real dinners;
- designed the flows and interaction details (the wizard, meal formats, split-by-share, the diner-facing link);
- made the technical calls: data model, the "line total" pricing rule, where validation lives, what to secure and what to defer;
- reviewed, tested, and debugged the output, including catching and fixing several rounds of split-math errors;
- set the quality bar: one shared calculation instead of copies, server-side validation of writes that change a bill, focused automated tests for the parts that handle money and private data.

AI tools generated most of the implementation code under that direction.

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, wouter, TanStack Query, Tailwind + shadcn/ui |
| API | Express (TypeScript), session auth via `express-session` + `connect-pg-simple` |
| Database | Supabase Postgres via Drizzle ORM (`drizzle-orm/node-postgres` over the transaction pooler) |
| File storage | Supabase Storage (private `receipts` bucket, signed upload/download URLs) |
| AI | OpenAI `gpt-4o` for receipt extraction and item categorization |
| Email | Resend (password reset) |
| Hosting | Vercel: static client from `dist/public`, the Express app as a Fluid Compute function |

### How it's wired

- `shared/schema.ts`: Drizzle table definitions and zod validation schemas, shared by client and server.
- `shared/splitMath.ts`: all bill-splitting math (item shares, per-person totals with cent allocation, and the subtotal check behind the discrepancy warnings).
- `server/app.ts`: builds the Express app (sessions, request logging, routes) without listening; used by both entries below.
- `server/index.ts`: local entry. Dev mode serves the client through Vite with HMR; `npm start` serves the built client.
- `api/index.mjs`: Vercel entry. `build:vercel` bundles `server/app.ts` into `api/_app.mjs` (generated, git-ignored).
- `vercel.json`: `/api/*` and `/objects/*` rewrite to the function; everything else falls back to the SPA.
- `server/receiptWrites.ts`: transactional multi-table writes (atomic re-scan, receipt deletion).
- `server/objectStorage.ts` + `server/objectAccess.ts`: receipt images. Clients request `POST /api/uploads/request-url`, PUT the file straight to Supabase, and store `/objects/uploads/<userId>/<uuid>`. `GET /objects/*` checks ownership or a matching `?share=<token>` before redirecting to a short-lived signed URL. Older `/objects/uploads/<uuid>` paths are authorized through the receipt that references them.

### Environment variables

See `.env.example`. All are server-side except `VITE_POSTHOG_KEY`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres **transaction pooler** URI (port 6543). URL-encode special characters in the password. |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key; used server-side for Storage signed URLs |
| `OPENAI_API_KEY` | Receipt extraction and item categorization |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Password-reset emails |
| `SESSION_SECRET` | Session cookie signing (`openssl rand -hex 32`). **Required** in production and on Vercel; the server refuses to start without it. |
| `VITE_POSTHOG_KEY` | Optional client analytics |

Secrets are never committed: `.env` is git-ignored, and deployed values live in Vercel project env vars.

### Local setup

```sh
npm install
cp .env.example .env   # fill in values; point DATABASE_URL at a dev database, not production
npm run dev            # Express + Vite HMR on http://localhost:5000
```

| Script | |
|---|---|
| `npm test` | Focused test suite (split math, image access rules, transactional writes against in-memory Postgres via PGlite). Needs no env vars or network. |
| `npm run check` | Typecheck |
| `npm run build` / `npm start` | Production build and server, locally |
| `npm run db:push` | Push schema changes with drizzle-kit (creates all tables on a fresh database; the `session` table is created on first run) |

### Deployment

Deployed on Vercel from this repository: `vercel deploy` for a preview, `vercel deploy --prod` for production.

## Scope and limitations

Tab-Splits is an independent product built for a real community, not a commercial SaaS platform, and it's sized accordingly.

- **It calculates; it doesn't move money.** Payment happens in Venmo via a prefilled deep link. The app records who paid the restaurant, not who has paid back.
- **Share links are bearer links.** Anyone with the link can view that tab, by design, so diners don't need accounts. Links don't expire.
- **AI extraction needs a human check.** The flow builds one in, and flags bills whose items don't match the subtotal, but the organizer makes the final call.
- **Built for dinner-party scale.** Tables of a handful of people and a few bills a month, on hobby-tier infrastructure.
