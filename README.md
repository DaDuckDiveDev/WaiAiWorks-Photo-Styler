# Kaiel Styler

AI photo studio for event and portrait work. Upload up to five photos, pick a
look, and get illustrated renders back — anime, 3D animated, comic, or
storybook. Photo fixes repair the shot where someone blinked or looked away,
either as a real photo or in any of the looks.

Built on the Kaiel Systems design system (Next.js 15, TypeScript, Tailwind,
Kaiel Abyss dark UI). Runs on Render at **styler.kaielsystems.com**.

## What's in the studio

- **Looks**: Anime, 3D Animated, Comic, Storybook.
- **Photo fixes**: Open closed eyes, Look at the camera, and Open eyes + look
  at camera. Each fix expands into its finishes: **Photo** keeps it a real
  photograph and only changes the eyes; any look fixes the eyes and restyles
  the photo in a single render.
- **Batch queue**: photos render one at a time with live progress, and the
  batch can be stopped after the current photo. Renders that never started
  are never charged.
- **Versions and compare**: every render is kept on its photo as a version.
  Finished renders open in a before/after divider (drag, or use the arrow keys)
  with Original, Compare, and Render views.
- **This photo / All photos**: fix just the shot that needs it.
- **Shortcuts**: ← → switch photos, ⌘/Ctrl + Enter renders, ⌘/Ctrl + V pastes
  a photo. The chosen look and scope are remembered per browser.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Tailwind CSS with the Kaiel Abyss token set, framer-motion, lucide icons
- Archivo (variable weight and width), self-hosted from `src/fonts` — builds
  never call Google Fonts
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

## How a render is described

A render is a **recipe**: a finish plus an optional fix.

```ts
{ finish: "anime", fix: null }          // a plain look
{ finish: "photo", fix: "open-eyes" }   // retouch only, stays a photo
{ finish: "disney", fix: "eyes-both" }  // Storybook with eyes opened and on camera
```

The browser posts `{ image, finish, fix }` to `/api/stylize`; the server
validates it with `parseRecipe` and builds the prompt with `buildPrompt`.
The older `{ image, style }` body is still accepted.

- `src/lib/catalog.ts` — ids, labels, and validation. Shared with the browser.
- `src/lib/prompts.ts` — the prompt text. Server-only, never shipped to clients.

To add a fix: add its id to `FixId` and `FIXES` in `catalog.ts`, write its
`retouch` and `artwork` wording in `prompts.ts`, and give it an icon in
`components/studio/inspector.tsx`. Every finish works with it automatically.

Each render uses one credit, fixes included, and a failed render refunds it.

## Layout

```
src/app/              routes — studio (/), login, /admin/stats, and API handlers
src/components/studio studio UI: viewer + compare, filmstrip, look/fix picker, dialogs
src/components/       logo, modal
src/lib/              auth, usage tracking, recipes and prompts, Replicate, image prep
src/fonts/            Archivo variable font (SIL OFL)
src/middleware.ts     session gate
scripts/              password hash generator
render.yaml           Render service configuration
legacy/               the original Flask app, kept for reference
```

## Notes

Deployment, DNS, and the cutover steps are in [MIGRATION.md](./MIGRATION.md).

To exercise the studio without spending Replicate credits, set
`REPLICATE_API_ROOT` to a local server that mimics Replicate's predictions API.
Leave it unset everywhere else.

## Slow renders

The studio shows elapsed time while waiting. Server logs include `[replicate]
accepted` and `[replicate] result` with the prediction ID, recipe, request elapsed
time, provider timestamps, and provider `predict_time` / `total_time` when
available. Compare those values with the prediction in Replicate to distinguish
provider execution from time spent waiting in the app. Photos and prompts are not
logged.

A prediction that reports 142 seconds inside Replicate cannot be explained by
browser Wi-Fi alone. The exact cause requires that prediction's logs and input
comparison; possible upstream delays are not evidence of a prompt or model
change. Check https://www.replicatestatus.com/ and provide the prediction ID to
Replicate support for an unexplained outlier. Do not automatically resubmit a
slow prediction: it may still complete and a second run can incur another charge.
