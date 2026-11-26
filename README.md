# Kazi

<img src="icons/icon.svg" width="72" height="72" alt="Kazi app icon">

**Job search, under control.**

**Live:** [kazi-joshuaajuna05-6109s-projects.vercel.app](https://kazi-joshuaajuna05-6109s-projects.vercel.app) · **Source:** [github.com/VolumeBrownlee/kazi](https://github.com/VolumeBrownlee/kazi)

[![Checks](https://github.com/VolumeBrownlee/kazi/actions/workflows/ci.yml/badge.svg)](https://github.com/VolumeBrownlee/kazi/actions/workflows/ci.yml)

Kazi is a private, phone-first job application command centre. It captures opportunities from WhatsApp forwards, screenshots and links, then keeps deadlines, replies, interviews, offers and tailored CVs in one calm workspace.

No account. No trackers. Your records stay in the browser on your device. The only server piece is an optional AI proxy, and it runs only when you enable AI and choose an AI action.

---

## What it does

- **Capture from anywhere.** Paste a WhatsApp message or job link, attach a screenshot or PDF, and Kazi pulls out the role, company, deadline, location, source and contact details when the text contains them. A bare link is read from its URL where possible; Kazi flags anything missing for you to confirm. On Android, Kazi can appear in the system share sheet.
- **One honest pipeline.** Every application moves through Captured → To apply → Applied → Interviewing → Offer, with a separate closed state for rejections. List and board views, source filters and search stay in sync. Archive a role and restore it from a drawer at the bottom of the pipeline.
- **Deadlines that speak up.** Today shows what is overdue, due now and waiting on you. The calendar collects deadlines, interviews and follow-ups, and exports to ICS for Google Calendar or your phone.
- **Replies, decoded.** Paste an email reply and Kazi classifies the intent (interview, rejection, offer, request for information, acknowledgement), extracts dates and suggests the next step. You log it in one tap.
- **A CV for each job.** Tailor a copy of your master CV against a job description. Keyword matching is transparent: you see exactly which terms matched, which are missing, and what changed. Edit the result in place, then print or download a clean copy.
- **Cover letters that start somewhere.** Generate a draft grounded in the job and your CV, then edit it with autosave.
- **Optional AI, clearly bounded.** Off by default. When you turn it on and press an AI action, Kazi can read a messy message, suggest a CV summary or draft a cover letter through a small server-side proxy. The local parser and generators keep working without it.
- **People and context.** Keep contacts, notes, timeline events and attachments with the application they belong to.
- **Portable by design.** JSON backup includes records and attachments. CSV export covers the pipeline. Restore a backup on another browser or device.
- **Works offline.** A service worker caches the shell; after the first load, the app opens without a connection.

---

## Run it locally

Kazi is a static site with no build step and no dependencies. It must be served over HTTP(S) — ES modules, the service worker and the share target do not work from `file://`.

```bash
cd kazi
npm run serve
# open http://localhost:4180
```

If you do not have npm:

```bash
cd kazi
python3 -m http.server 4180
```

Run the parser tests with:

```bash
npm test
```

---

## Publish it

Kazi is a static site plus one optional serverless function for AI. The repository root is the Vercel project root.

```bash
npx vercel
npx vercel --prod
```

Or import the GitHub repository in Vercel and leave **Root Directory** at the repository root. No build command is needed.

To enable AI, add these environment variables in Vercel (Project → Settings → Environment Variables), then redeploy:

| Variable | Purpose |
| --- | --- |
| `AI_API_KEY` | Provider key. Kept server-side. |
| `AI_BASE_URL` | OpenAI-compatible base URL. Defaults to `https://api.openai.com/v1`. |
| `AI_MODEL` | Model name. Defaults to `gpt-4o-mini`. |

Any OpenAI-compatible provider works. For example, Gemini's free tier:

```text
AI_API_KEY=<your key>
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL=gemini-2.5-flash
```

Or OpenRouter:

```text
AI_API_KEY=<your key>
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

`GEMINI_API_KEY`, `OPENROUTER_API_KEY` and `OPENAI_API_KEY` are also read directly if you prefer provider-specific names. Never put a key in `js/` or commit a `.env` file.

Without a key, the whole app still deploys and works; the AI toggle reports that AI is not configured. The proxy rate-limits requests per IP in memory, caps input size and never logs request bodies. For a busy public deployment, put a durable rate limit in front of it.

## Install it on a phone

1. Open the deployed Vercel URL in Chrome on Android or Safari on iOS.
2. Use **Install app** / **Add to Home Screen**.
3. The app opens offline after the first visit.

Android Chrome also registers Kazi as a share target after installation, so a WhatsApp message, link or screenshot can be shared directly into the capture screen.

> The share target requires HTTPS in production. `localhost` is treated as secure for development. iOS does not support web share targets; use copy/paste there.

---

## A first run

The onboarding screen offers two paths:

- **Explore the sample workspace** loads Amina Nakato's eight-application demo, with CVs, a cover letter, contacts and dates. It is a complete story, not a blank form with a different name.
- **Start fresh** creates an empty workspace for you.

You can load the sample workspace later from **Settings → Sample workspace**, and remove it again without touching your own records.

### Capture a job

Use the **+** button, the Capture shortcut, or share from another app. Kazi accepts:

- pasted text,
- links,
- screenshots and PDFs,
- a combination of the above.

The parser looks for role titles, companies, deadlines, locations, emails, phone numbers and common source names. Everything is editable before saving. A screenshot is stored as an attachment; Kazi does not OCR it.

With AI assistance enabled, **Read with AI** sends only the pasted message to the AI endpoint and fills the same fields. The local **Read this message** button always works and sends nothing.

### Track a reply

Open an application, choose **Log reply**, and paste the email body. Review the detected intent and dates, then save. The reply and suggested next step are added to the application timeline.

### Tailor a CV

Open a job, choose **Tailor CV**, and paste the job description. Kazi creates a copy of a chosen CV, compares the description with the CV content, and shows:

- matched keywords,
- missing keywords,
- suggested summary adjustments.

Nothing is invented silently. Review the tailored copy, edit it in the CV editor, then print it or download it.

With AI assistance enabled, **Suggest with AI** writes a profile summary from the selected CV facts and advert, and **Generate an AI draft** does the same for a cover letter. Both are drafts: check every claim. The local summary and cover generators are used automatically if AI is unavailable.

### Back up

**Settings → Download backup** produces a JSON file containing the workspace and all stored attachments. Keep it somewhere safe. CSV export is available for the pipeline; JSON is the complete restore format.

Restoring a backup replaces the current workspace after confirmation.

---

## Data, privacy and limits

- **Records:** `localStorage` key `kazi.state.v1`.
- **Attachments:** IndexedDB database `kazi-files`, object store `files`.
- **Android share hand-off:** IndexedDB database `kazi-shared`.
- **Offline shell:** Cache Storage, currently `kazi-shell-v9`.
- No network requests are made after the shell loads unless you enable AI assistance and choose an AI action. That request goes to the same origin (`/api/ai`); the server forwards the selected text to the configured provider. There are no analytics, third-party fonts, CDNs or third-party browser scripts.
- AI is off by default. The capture screen always offers a local read, and local CV summaries and cover drafts remain available if the AI endpoint is missing or fails.

Because data is local:

- Clearing site data or uninstalling the browser profile deletes the workspace. Backups are the escape hatch.
- Data does not sync between devices or browsers automatically. Export and restore, or wait for the roadmap's sync work.
- Browser storage can be evicted under extreme storage pressure. Install the PWA and keep periodic backups.
- Backups are not encrypted. Treat the JSON file as sensitive.
- Notifications require browser permission and work best from an installed PWA. Kazi sends at most one reminder per day.
- Email integration is paste-first in this version. Gmail/Outlook OAuth is deliberately out of scope for the local-only MVP.
- The share target is Android/Chromium only.
- Screenshots are attached, not transcribed.

---

## Project structure

```
kazi/
├── index.html              app shell, navigation, SVG sprite
├── styles.css              design system, responsive and print styles
├── manifest.webmanifest    PWA metadata, shortcuts, Android share target
├── sw.js                   offline shell, share-target POST, notifications
├── js/
│   ├── app.js              routing, views, forms, actions, editors
│   ├── store.js            state, persistence, demo data, analytics, export
│   ├── cv.js               CV/cover rendering and keyword tailoring
│   ├── parse.js            job/reply/date parsing
│   ├── ai.js               opt-in AI client
│   └── utils.js            dates, CSV, ICS, files, clipboard helpers
├── api/ai.js               server-side AI proxy (no key in the browser)
├── tests/parse.test.mjs    14 parser tests
├── icons/                  app icon, favicons, social card
├── CONTRIBUTING.md         setup, checks and contribution rules
├── LICENSE                 MIT
├── .github/                issue forms, PR template, CI checks
└── vercel.json             static routing, security headers, function limit
```

When changing precached assets, bump `CACHE_NAME` in `sw.js`. The worker is network-first and falls back to cache when the server is unavailable or returns a non-OK response, so an installed app keeps opening offline.

---

## Status and roadmap

Kazi is an MVP built around one person's job search, designed so it can be used by others. See [PLAN.md](PLAN.md) for the product plan, architecture notes and the road to sync, email integration and richer capture.

Near-term work:

- OCR or on-device text extraction for screenshots.
- Gmail/Outlook read-only sync with explicit consent.
- Real-device notification scheduling and install prompts.
- Optional encrypted backup.
- Hosted, opt-in sync for multi-device use.

---

## Use it, fork it, change it

Kazi is public and MIT-licensed. Anyone can:

- use the [live app](https://kazi-joshuaajuna05-6109s-projects.vercel.app),
- fork the [repository](https://github.com/VolumeBrownlee/kazi) and change it,
- deploy their own copy for a team, a community or themselves,
- contribute a fix, a parser rule or a feature back upstream.

### Deploy your own copy

1. Fork [VolumeBrownlee/kazi](https://github.com/VolumeBrownlee/kazi).
2. Import the fork at [vercel.com/new](https://vercel.com/new). Leave the **Root Directory** as the repository root and the framework preset as **Other**.
3. Deploy. There is no build command, no database and no account system.

AI is optional. Without `AI_API_KEY`, the deployment still works and uses the local parsers and generators. To enable AI, add the variables described in [Publish it](#publish-it), then redeploy.

### Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the checks, the project map and the design and privacy rules. Small fixes can go straight to a pull request. For a larger feature, open an issue first so the approach can be agreed before you build it.

Bug reports, feature requests, parser examples and accessibility notes are all useful. If you are not sure where to start, open an issue and ask.

## License

MIT — see [LICENSE](LICENSE). You can use, modify and distribute Kazi, including commercially, as long as the copyright notice is kept.
