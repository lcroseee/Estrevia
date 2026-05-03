# Google Search Console — Domain Property Setup

| Field | Value |
| --- | --- |
| Updated | 2026-05-02 |
| Owner | Founder (Kirill) |
| Estimated time | ~10 minutes once you have the GSC verification token |

---

## 1. Why Domain property (not URL prefix)

Google Search Console offers two property types:

| Type | Covers | When to use |
| --- | --- | --- |
| **URL prefix** | One URL scheme + subdomain (e.g., `https://estrevia.app/`) | Fine for simple sites with a single origin |
| **Domain** | All subdomains + all protocols (`http://`, `https://`, `www.`) | Required for Estrevia |

**Use Domain property because:**

- Estrevia serves content under both `https://estrevia.app/` (EN) and `https://estrevia.app/es/` (ES). Domain property aggregates all traffic in one place.
- Per-country traffic breakdown is critical for `/es/` ROI measurement — we need to confirm the Spanish content is driving MX/ES/LATAM clicks, not just US users switching lang.
- Vercel adds `www.` redirects; Domain property captures any accidental `www.` impressions.
- Future subdomains (e.g., `mcp.estrevia.app`) are captured automatically.

---

## 2. Add Domain property in GSC

1. Open [https://search.google.com/search-console](https://search.google.com/search-console) and sign in with your Google account.
2. Click **"+ Add property"** (top-left property selector dropdown).
3. Select **"Domain"** tab (not URL prefix).
4. Enter: `estrevia.app` (no `https://`, no trailing slash).
5. Click **"Continue"**.
6. GSC displays a TXT record. It looks like:

   ```
   Record type: TXT
   Host:        estrevia.app   (some providers show @ for apex)
   Value:       google-site-verification=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   TTL:         300 (default is fine)
   ```

7. **Copy the full value string** — you'll need it in step 3.

---

## 3. DNS provider workflows

> **Which provider are you using?** Check your domain registrar or the Vercel dashboard under Domains → estrevia.app → Nameservers. Tell the team (leave a comment on Task #6) so we can confirm the exact provider steps apply.

### 3a. Vercel-managed DNS (most likely)

If `estrevia.app` nameservers point to Vercel (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`):

1. Open [https://vercel.com/dashboard](https://vercel.com/dashboard) → your team → **Settings** → **Domains**.
2. Click `estrevia.app`.
3. Scroll to **DNS Records** section → click **"Add"**.
4. Fill in:
   - **Type:** `TXT`
   - **Name/Host:** `@` (leave blank or type `@` — means apex/root)
   - **Value:** paste the full `google-site-verification=...` string
   - **TTL:** leave default (60 or 300)
5. Click **"Save"**.
6. Propagation: 1–10 minutes for Vercel DNS (very fast).

### 3b. Cloudflare

1. Open [https://dash.cloudflare.com](https://dash.cloudflare.com) → select your domain `estrevia.app`.
2. Click **DNS** → **Records** → **+ Add record**.
3. Fill in:
   - **Type:** `TXT`
   - **Name:** `@`
   - **Content:** paste the full `google-site-verification=...` string
   - **TTL:** Auto (or 300)
   - **Proxy status:** DNS only (grey cloud — no proxying for TXT)
4. Click **Save**.
5. Propagation: 1–5 minutes.

### 3c. Generic providers (Namecheap, Porkbun, GoDaddy, etc.)

1. Log in to your registrar's control panel.
2. Find **DNS Management** or **Advanced DNS** for `estrevia.app`.
3. Add a new record:
   - **Type:** `TXT`
   - **Host:** `@` or leave blank (means root/apex)
   - **Value/Answer:** paste the full `google-site-verification=...` string
   - **TTL:** 300 (or "automatic" / "minimum")
4. Save changes.
5. Propagation: 5–30 minutes (Namecheap / Porkbun are fast; GoDaddy can take up to 30 min).

---

## 4. Verify DNS propagation with `dig`

Before clicking "Verify" in GSC, confirm the TXT record is live:

```bash
dig TXT estrevia.app +short
```

Expected output includes a line like:

```
"google-site-verification=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

If the record is not visible yet, wait 2–5 minutes and re-run. Do not click "Verify" before `dig` shows the record — it will fail and GSC may add a 1-hour retry delay.

**Alternative (no `dig` installed):** use [https://toolbox.googleapps.com/apps/dig/](https://toolbox.googleapps.com/apps/dig/) → select TXT, enter `estrevia.app`.

---

## 5. Verify in GSC + post-verification setup

Once `dig` shows the TXT record:

1. Return to GSC → click **"Verify"**.
2. GSC shows: ✅ "Ownership verified" (or similar green banner).

**Immediately after verification (takes ~2 minutes):**

1. **Submit sitemap:**
   - In the left sidebar → **Sitemaps**.
   - Enter: `sitemap.xml` (GSC auto-prefixes the domain).
   - Click **Submit**.
   - Status will show "Pending" initially; "Success" within a few hours.

2. **Enable email alerts:**
   - Click the ⚙️ gear icon (top right) → **Property Settings** → scroll to "Email notifications".
   - Enable: "Index coverage issues", "Manual action", "Security issues".

3. **International targeting:**
   - Left sidebar → **Legacy tools and reports** → **International Targeting**.
   - Leave the **Country** tab set to "No country targeting" (let Google decide based on `hreflang` tags, which are already implemented in `sitemap.ts`).
   - The `/es/` Spanish pages already carry `hreflang="es"` — no override needed.

---

## 6. Confirmation step

After completing the above:

- Add a comment on Task #6 in the TaskList: **"GSC verified — Domain property estrevia.app active, sitemap submitted, email alerts enabled."**
- Share a screenshot of the GSC "Overview" tab showing the domain property (optional but helpful for the session record).

The code merge does NOT wait for GSC verification — `sitemap.ts` and all SEO infrastructure ship independently. GSC setup is async and can happen any time during or after the session.

---

## 7. Troubleshooting

### TXT record visible in `dig` but GSC still says "not verified"

- Wait 2 more minutes and retry. GSC caches DNS lookups and may need a second polling cycle.
- Confirm you copied the **full** value string including `google-site-verification=` prefix (not just the token after the `=`).
- Check if your DNS provider trimmed or truncated the value. TXT records must be ≤ 255 bytes per string segment — Google's tokens are ~72 chars, well within limits.

### Your DNS provider only allows one TXT record per host

Some legacy providers enforce a single TXT record per hostname. If `estrevia.app` already has a TXT record (e.g., SPF `v=spf1 ...`):
- Check if the provider supports multiple TXT records per host — most modern providers do.
- If not, you can consolidate: add the `google-site-verification=...` value as a second string in the same TXT record entry, separated by a space (not newline). Example: `"v=spf1 include:example.com ~all" "google-site-verification=XXXX"`.
- Alternatively, consider migrating DNS to Vercel-managed (free, supports unlimited TXT records).

### Multiple TXT records (no conflict)

Multiple TXT records on the same host (`@`) are standard and expected. Gmail/SPF/DKIM all coexist as separate TXT records. Google's verifier reads all of them; your existing records are not affected.

### GSC shows "Domain property" but Performance data looks low

- GSC Performance data backfills from the verification date — it won't show historical data from before verification.
- Allow 48–72 hours after first indexing activity for meaningful click/impression data to appear.
- The property filter "Sites" → `estrevia.app` in GSC Performance shows all subdomains + both protocols in aggregate.

---

*Document maintained by `seo-eng`. Last updated: 2026-05-02.*
