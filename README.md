# Kaiel Styler

AI photo styling for event and portrait work. Upload up to five photos, pick a
look, and get illustrated renders back — anime, 3D animated, comic, or storybook.

Built on the Kaiel Systems design system (Next.js 15, TypeScript, Tailwind,
ocean-glass UI). Runs on Render at **styler.kaielsystems.com**.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Tailwind CSS with the shared Kaiel token set
- Replicate (`black-forest-labs/flux-kontext-pro`) for rendering
- Postgres for usage counters and daily credits — optional; the app runs
  unmetered without it
- Sessions are signed cookies, images never touch a disk

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required env: `REPLICATE_API_TOKEN`, `SESSION_SECRET`.
See `.env.example` for the full list.

The only login is username `general`, password `general 1` (including the space).
The password is stored as a PBKDF2 hash. Old `STYLER_USERS` settings are ignored,
and sessions belonging to removed accounts are rejected. All users share this
account's daily credit allowance. Admin access remains controlled by `STYLER_ADMINS`.

## Layout

```
src/app/            routes — studio (/), login, /admin/stats, and API handlers
src/components/     studio UI, modal, logo, background
src/lib/            auth, usage tracking, styles/prompts, Replicate, image prep
src/middleware.ts   session gate
scripts/            password hash generator
render.yaml         Render service configuration
legacy/             the original Flask app, kept for reference
```

## Notes

Deployment, DNS, and the cutover steps are in [MIGRATION.md](./MIGRATION.md).

## Slow renders

The studio shows elapsed time while waiting. Server logs include `[replicate]
accepted` and `[replicate] result` with the prediction ID, request elapsed time,
provider timestamps, and provider `predict_time` / `total_time` when available.
Compare those values with the prediction in Replicate to distinguish provider
execution from time spent waiting in the app. Photos and prompts are not logged.

A prediction that reports 142 seconds inside Replicate cannot be explained by
browser Wi-Fi alone. The exact cause requires that prediction's logs and input
comparison; possible upstream delays are not evidence of a prompt or model
change. Check https://www.replicatestatus.com/ and provide the prediction ID to
Replicate support for an unexplained outlier. Do not automatically resubmit a
slow prediction: it may still complete and a second run can incur another charge.
