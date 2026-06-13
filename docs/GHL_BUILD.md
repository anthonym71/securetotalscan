# GoHighLevel build guide

The app (Vercel) is the product: landing, free scan, agent dashboard. GHL owns
the **funnel, payments, and CRM** behind it. This guide covers the GHL-side
build and how it connects to the app.

## How the app connects to GHL

The free scan ends with an "email me the full report" capture. That posts to the
app's `/api/lead` route, which creates a contact in GHL via the v2 API.

```
Free scan result → LeadCapture form → /api/lead → GHL v2 API (create contact)
                                                   tags: secure-total-scan-lead,
                                                         grade-<a..f>, score-<n>
                                                   website: <scanned url>
```

### 1. Create the private integration token
GHL → **Settings → Private Integrations → Create** → scope `contacts.write`
(add `contacts.readonly` too). Copy the token.

### 2. Get your Location ID
GHL → **Settings → Business Profile** (or the URL `.../location/<LOCATION_ID>/`).

### 3. Set them on Vercel (server-side secrets)
```bash
vercel env add GHL_API_TOKEN production       # paste the token
vercel env add GHL_LOCATION_ID production      # paste the location id
vercel --prod                                  # redeploy
```
The token is read only on the server in `/api/lead`; it never reaches the browser.

## Build the funnel in GHL

### Pipeline (Opportunities)
Stages: `Lead` → `Scanned` → `Report sent` → `Trial` → `Paid` → `Churned`.

### Workflow: new scan lead
- Trigger: **Contact created** (or **Tag added** = `secure-total-scan-lead`).
- Actions:
  1. Send the PDF report email (template below).
  2. Create an Opportunity in stage `Report sent`.
  3. If tag `grade-f` or `grade-d`: start the "high-risk" nurture (stronger CTA to Pro).
  4. Wait 2 days → follow-up email → SMS if no open.

### Stripe products (Payments → Products)
| Product | Price | Maps to |
| --- | --- | --- |
| Pro | $49/mo | All five agents, repo + log analysis, scheduled monitoring |
| Organization | custom / contact | Continuous monitoring, compliance reports, SSO, SLAs |

Wire Stripe in GHL **Payments → Integrations → Stripe**, then add checkout to the
Pro CTA on the funnel page.

### Funnel pages
- Page 1: marketing landing (mirror the app's positioning) with a "Run a free
  scan" button linking to `https://securetotalscan.vercel.app` (or the custom
  domain). Optionally embed the scan via iframe later.
- Page 2: Pro checkout (Stripe).
- Page 3: thank-you / onboarding.

### Domain
Point `securetotalscan.com`:
- `app.` or root → Vercel (the product), and/or
- `go.` / `get.` → GHL funnel.
Decide which subdomain is the marketing front vs the app.

## Report email template (starter)

> Subject: Your Secure Total Scan report — grade {{contact.grade}}
>
> We scanned {{contact.website}} and graded it {{contact.grade}}. The full
> breakdown with a fix for every issue is attached. Want the deep analysis
> (five agents over your code and logs)? Start a Pro trial: [link]

## Notes
- Custom fields: to store score/grade as fields (not just tags), create them in
  GHL and extend `/api/lead` to send `customFields: [{ id, field_value }]`.
- The app already tags `grade-<a..f>` and `score-<n>` and sets `website`, so you
  can segment and personalize without custom fields to start.
