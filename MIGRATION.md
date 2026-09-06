# Migration: Flask → Next.js, same Render service, new domain

The app was a Flask server on Render backed by Postgres. It's now a Next.js 15
app on the Kaiel Systems stack — still on Render, still backed by the same
Postgres, now at `styler.kaielsystems.com`.

Nothing about the hosting needs to move. Render runs a long-lived Node process,
so the 20–40 second Replicate call is just a slow request rather than something
that has to fit inside a serverless function's timeout. The work here is
converting the service from a Python runtime to a Node one, pointing the
subdomain at it, and rotating the credentials that leaked into git.

---

## 1. Before you deploy

**Rotate the Replicate token.** The old one was committed to `render.yaml` and
is in this repo's public git history. Treat it as compromised: revoke it at
replicate.com/account/api-tokens and issue a new one.

**Generate a session secret.**

```bash
openssl rand -base64 32
```

**Shared login.** The only account is `general`, with password `general 1`
(including the space). Its PBKDF2 hash is configured in `src/lib/auth.ts`.
Remove any old `STYLER_USERS` environment variable; it is no longer read.
Sessions for removed accounts are rejected. Daily credits are shared by everyone
using this account.

**Decide who's an admin.** `STYLER_ADMINS` (default `admin`) controls who can
reach `/admin/stats`. Anyone else gets a 404.

---

## 2. Push the code

```bash
rm -f .git/index.lock          # left behind by an interrupted operation
rm -rf static public/WaiaiLogo.png public/WaiaiLogoHori.png
npm install
npm run build                  # sanity check locally first
git add -A
git commit -m "Rebuild as Next.js on the Kaiel Systems design system"
git push
```

---

## 3. Convert the Render service to Node

The existing `ghibli-photo-app` service is configured for Python. Rather than
create a new service and lose the deploy history, change it in place:

Render dashboard → the service → **Settings**:

| Setting | New value |
|---|---|
| Name | `kaiel-styler` (cosmetic — this also changes the `.onrender.com` hostname) |
| Language / Runtime | **Node** |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/login` |

If Render won't let you switch the runtime on an existing service, create a new
Web Service from this repo instead — `render.yaml` in the repo root has the
whole configuration, so a Blueprint deploy will fill it in for you. Delete the
old service once the new one is serving.

**Instance type.** Free spins down after 15 minutes idle and takes about a
minute to wake, which is not something to hand a client. Starter is the floor
for anything customer-facing.

**Environment variables.** Under Environment, set:

| Variable | Required | Notes |
|---|---|---|
| `REPLICATE_API_TOKEN` | yes | The new token from step 1 |
| `SESSION_SECRET` | yes | 32+ random characters |
| `DATABASE_URL` | for tracking | The existing Postgres **Internal Database URL** |
| `DAILY_CREDITS` | no | Renders per user per day. Defaults to 20 |
| `STYLER_ADMINS` | no | Who sees `/admin/stats`. Defaults to `admin` |
| `RESEND_API_KEY` | no | Support/report email. Without it, messages go to the service log |
| `SUPPORT_EMAIL_TO` | no | e.g. `johnwangcpp@gmail.com` |
| `SUPPORT_EMAIL_FROM` | no | Must be a domain verified in Resend |

Delete the old Python-era variables: `EMAIL_USER`, `EMAIL_PASS`,
`EMAIL_RECEIVER`, and `app.secret_key`.

**The database carries over untouched.** The app reads and writes the same
`user_tracking` table with the same column names the Flask app used, so every
historical upload, download, and stylization count survives. The table is
created on first use if it isn't there, so a fresh database also works with no
manual step. Use the *Internal* connection string when the database and the web
service are in the same Render region — it's faster and doesn't traverse the
public internet.

If `DATABASE_URL` is absent the app still runs; it just stops counting and stops
enforcing credits.

---

## 4. Point the subdomain (DNS at SiteGround)

**In Render:** the service → Settings → **Custom Domains** → Add
`styler.kaielsystems.com`. Render shows the CNAME target, which is the service's
own `.onrender.com` hostname — for a service named `kaiel-styler` that's
`kaiel-styler.onrender.com`. Copy whatever Render actually displays.

**First confirm SiteGround answers DNS for the domain.** Editing a zone at a host
that isn't authoritative does nothing.

```bash
dig +short NS kaielsystems.com
```

If that returns `ns1.siteground.net` / `ns2.siteground.net` (or similar
SiteGround hostnames), you're in the right place. If it returns Cloudflare,
Vercel, or your registrar's nameservers, make the record there instead — and on
Cloudflare set the record to **DNS only** (grey cloud), not proxied. Render
issues its own certificate and can't do that through Cloudflare's proxy.

**Then, in SiteGround Site Tools:** Websites → your site → Site Tools →
Domain → **DNS Zone Editor** → Create New Record → **CNAME** tab.

```
Name          styler
Resolves to   kaiel-styler.onrender.com     (whatever Render showed you)
TTL           leave at default
```

Click Create, then hit **Verify** on the domain card in Render.

Three gotchas:

- **Do not use the Subdomain tool.** Site Tools has a separate Domain →
  Subdomains feature. Creating `styler` there points it at SiteGround's own
  server with an A record, which conflicts with the CNAME and breaks
  verification. The DNS Zone Editor is the only place you need to touch.
- **CNAME won't coexist with other records on the same name.** If `styler`
  already has an A or TXT record, delete it first — SiteGround will reject or
  silently ignore the CNAME otherwise.
- **Remove any AAAA record on that name.** Render is IPv4-only and a stray
  IPv6 record produces intermittent failures that are miserable to diagnose.

Render issues the TLS certificate automatically once the record resolves and
redirects HTTP to HTTPS on its own. Verify with:

```bash
dig +short CNAME styler.kaielsystems.com
```

Propagation is usually minutes on SiteGround but can take up to 24–48 hours.

---

## 5. Clean up

Once `styler.kaielsystems.com` is serving real renders:

1. Confirm the old `/static/uploads` and `/static/outputs` directories on the
   Render disk are no longer written to, then detach the disk if the service has
   one. Nothing is stored on disk any more.
2. If anyone has the old `*.onrender.com` URL bookmarked, send them the new one.
   The old hostname keeps working, so this isn't urgent.
3. Confirm the old Replicate token is revoked at replicate.com — the service
   resuming with a stale env var is the one way it could still be used.

Keep the Postgres instance. It's holding the usage history.

---

## 6. What changed

**Same tracking, same table.** Uploads, downloads, stylizations, per-user daily
credits, and last sign-in all still land in `user_tracking`. Two behavioural
differences: credits are now enforced rather than merely counted (the Flask
version let the balance go negative), and a render that fails refunds its credit
instead of charging for nothing. The daily reset happens on the user's first
request after midnight UTC, in a single atomic statement, so two simultaneous
renders can't both trigger a reset.

**Admin stats work now.** `app.py` defined `view_stats` twice — once for
`/admin/stats`, once for `/aleksei/` — so in Python the second silently replaced
the first and *neither* page was reachable. `/admin/stats` is rebuilt, gated on
`STYLER_ADMINS`, and has a CSV export. The Aleksei per-restaurant view is gone;
it never worked and the `restaurant` column it filtered on didn't exist on the
model.

**No more disk.** The old app saved each upload to `static/uploads`, then handed
Replicate a public URL pointing back at itself. That worked but meant every
customer photo sat on the server indefinitely, reachable by anyone who guessed
the filename. Photos are now downscaled in the browser to a 1536px long edge and
sent to Replicate as a data URI — the API accepts these directly, so no
intermediate public URL is needed. Results come from Replicate's CDN through
`/api/download`, which forces a proper filename and refuses any host outside
`*.replicate.delivery`. Nothing touches a disk. The tradeoff is that results
expire when Replicate drops them, roughly an hour, so users need to download
before closing the tab — the UI says so.

**Auth.** Same username/password model, with one shared `general` account and a PBKDF2 password hash, and sessions
are signed HMAC cookies with a 12-hour expiry instead of Flask's server-side
session. Sign-in is rate limited per IP and per username, and a failed attempt
on an unknown username burns the same amount of time as a real one so response
timing doesn't reveal which accounts exist.

**Headers.** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, and a restrictive
Permissions-Policy are set on every response.

**Email.** The old SMTP-to-Gmail path is replaced with Resend. If it isn't
configured, support messages are logged rather than lost.

**Style naming.** `pixar` and `disney` are now labelled "3D Animated" and
"Storybook" in the UI, and the prompts no longer name studios. The style IDs are
unchanged internally, so history in the database still lines up. This is
trademark hygiene — the renders look the same.

The original Flask app is preserved under `legacy/` for reference.

---

## 7. Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

Leave `DATABASE_URL` blank locally unless you want to test credits — without it
the app runs unmetered and the stats page says so.
