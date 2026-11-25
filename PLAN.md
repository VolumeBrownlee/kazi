# Kazi — product plan

**Job search, under control.**

## 1. The problem

Job seekers do not lack job listings. They lack a reliable place to keep the whole search:

- WhatsApp forwards with a role, a deadline and a contact, buried under three days of chat.
- Screenshots saved to a camera roll and never looked at again.
- Spreadsheets that track a company name but not the reply that arrived, the interview date, the CV version sent, or the follow-up that was promised.
- LinkedIn's saved jobs, email, notes and documents all living in different products.

Existing trackers cover fragments. A general-purpose spreadsheet can hold anything but reminds you of nothing. Kazi is a focused command centre for the period between hearing about a job and accepting an offer.

## 2. Product principles

1. **Phone first, not phone adapted.** Capture, triage and follow-up must be comfortable one-handed on a small screen. Desktop is the place to edit a CV.
2. **Capture must be cheap.** If saving a job takes more than a few seconds, it will not happen. Paste or share, confirm, done.
3. **The app should tell you what needs you.** A list of applications is storage. Deadlines, stale applications and unanswered replies are the product.
4. **No black boxes.** Tailoring shows matched and missing keywords. Reply classification shows why it reached its conclusion and lets you correct it.
5. **Local-first, no lock-in.** The MVP has no account, backend or analytics. Backups are readable JSON with attachments, and CSV is available for escape.
6. **Calm, not gamified.** No streak pressure, confetti or red badges for their own sake. The interface should reduce anxiety, not manufacture it.
7. **Zero dependencies.** Static HTML, CSS and ES modules. No build step, no supply chain, no CDN. It should still open in five years.

## 3. MVP scope (delivered)

### Capture
- Paste text, a link or both.
- Attach screenshots, PDFs and documents.
- Parse role, company, location, deadline, source, contact email/phone and notes.
- Android share target (multipart POST) stores the payload and opens Kazi's capture flow.
- Manual capture remains the fallback everywhere.

### Pipeline
- Statuses: captured, to apply, applied, interviewing, offer, rejected, withdrawn, accepted, talent pool.
- List and board views, source filter, search, status counts.
- Job detail with notes, contacts, timeline, documents and next actions.
- Edit, archive and restore, delete, mark applied.
- Deadline and stale-application signals.

### Communication
- Paste an email reply.
- Classify intent: interview, rejection, offer, request, acknowledgement, unknown.
- Extract dates and suggest a next step.
- Log the reply and event on the application timeline.

### CV studio
- Master profile with experience, education, projects, skills, certifications and languages.
- Multiple CVs, autosaving editor, live preview.
- Tailor a copy per job with transparent keyword matching.
- Summary suggestions grounded in the job description.
- Cover letter drafts tied to a job, with autosave.
- Print/PDF layout and downloadable Word-compatible HTML.

### Organisation
- Today dashboard: overdue, due now, waiting on you, interview agenda.
- Calendar with month view, agenda and ICS export.
- People directory derived from application contacts.
- Insights: funnel, sources, response and interview rates.
- Settings: profile, reminders, sample workspace, CSV import/export, JSON backup/restore, storage meter, reset.

### Platform
- Installable PWA with icons, shortcuts and standalone display.
- Offline shell via service worker.
- Responsive layouts down to 320 px.
- Print styles for CVs and cover letters.
- localStorage for state, IndexedDB for attachments.
- No account, no network calls after load.

## 4. Architecture

```
index.html ── styles.css
     │
     └── js/app.js  routing, views, DOM events, editors
            ├── js/store.js  state schema, persistence, demo, analytics, export
            ├── js/cv.js     CV/cover model, rendering, tailoring
            ├── js/parse.js  job/reply/date parsing (pure functions)
            └── js/utils.js  dates, CSV, ICS, files, clipboard
     sw.js  offline cache, share-target POST, notification clicks
```

### State
Single versioned object in `localStorage` under `kazi.state.v1`:

- `meta`: onboarding, demo flags, timestamps, last export.
- `profile`: identity, summary, skills, experience, education, projects.
- `applications[]`: role, company, status, dates, source, description, notes, contacts, timeline, documents, intent, archived flag.
- `cvs[]`, `covers[]`: editable documents with job linkage and timestamps.
- `settings`: reminders, default view, demo banner.
- Derived data (attention items, analytics, calendar events, contacts) is computed from state rather than stored twice.

### Files
IndexedDB `kazi-files` holds attachment blobs by id. JSON backups serialise them to data URLs. `kazi-shared` holds the most recent Android share payload until the app consumes it.

### Offline
The worker precaches the shell and uses network-first for same-origin GETs, falling back to cache on network failure, non-OK responses or offline navigation. `CACHE_NAME` must be bumped when precached assets change. Share-target POSTs are handled in the worker and redirected to the app.

### Parsing
`parse.js` is pure and covered by tests. It avoids network services and language models, which keeps the app offline and private. Parsing is heuristic and always editable.

### Privacy
No third-party scripts, fonts, analytics or external requests. Backups are unencrypted, so the user is told to treat them as sensitive. Clearing site data is destructive; the UI makes that explicit.

## 5. Roadmap

### 0.1 — MVP (current)
- Complete local workflow from capture to offer.
- CV tailoring and cover drafts.
- Backup/restore, CSV, ICS.
- Offline install and Android share target.
- QA: parser tests, onboarding demo, pipeline, job detail, replies, CV/cover editing, calendar, imports, backup/restore, reset, offline reload, notifications fallback, archive/restore, delete, 320–390 px layouts, Lighthouse 100 accessibility.

### 0.2 — Reduce friction
- **Screenshot text extraction.** On-device OCR or a user-triggered extraction flow, with a clear privacy note. No upload.
- **Better share handling.** Multiple shares batched into a review queue; PDFs parsed for text where possible.
- **Reply inbox.** A paste queue so several replies can be processed without opening each job first.
- **Smart follow-up suggestions.** Use response times and status age to propose a specific next action.
- **Install and notification onboarding.** Prompt at the right moment, explain browser limits, test notification delivery.
- **Encrypted backup.** Optional passphrase encryption for the JSON export.
- **Accessibility and i18n pass.** Language selection, RTL support, translated parser terms.

### 0.3 — Email and calendar integration
- Gmail and Outlook read-only OAuth, with explicit consent and a local token store.
- Match replies to applications by sender domain and subject, with a review queue.
- Calendar two-way sync or at least subscription feeds.
- Provider-specific parsing for common ATS emails.

This phase breaks the strict "no network" property. It should be opt-in and clearly separated from the local-only core.

### 0.4 — Multi-device
- Optional hosted account and end-to-end encrypted sync.
- Conflict handling for edits made offline on two devices.
- Shared workspaces for coaches or small job-search groups.
- Native share extensions for iOS.

### 1.0 — Beyond the tracker
- Interview preparation packs generated from the job and CV.
- Offer comparison: salary, location, growth, risk.
- Follow-up cadences and employer research notes.
- Exportable search journal for career coaching.

## 6. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Browser storage eviction or accidental clearing | Visible backup control, storage meter, install prompt, restore path. |
| Capture is still too manual | Share target, parser improvements, batch queue, OCR. |
| Heuristic parsing misfires | Always show an editable form; never save silently without review. |
| Notification permission denied or unreliable | Daily reminder is optional; Today and calendar remain the source of truth. |
| Data trapped on one device | JSON backup/restore now; encrypted sync later. |
| Email APIs are restrictive and privacy-sensitive | Keep paste-first default; opt-in OAuth with least privilege. |
| Scope creep into a full ATS | Stay focused on one job seeker's next action, not recruiter workflows. |

## 7. Success measures

- A forwarded job can be saved, with deadline and source, in under 30 seconds.
- The user can answer "what needs me today?" without opening another app.
- Every application has a next action or a clear reason to wait.
- A tailored CV can be produced in one session and printed without layout work.
- The workspace survives an offline reload and a browser restart.
- Backup and restore round-trip without losing attachments or dates.
- No horizontal scrolling at 320 px, and no critical accessibility failures.

## 8. Testing

- `npm test` — parser unit tests (14 assertions).
- Manual smoke tests: onboarding demo, pipeline list/board/search/filter, job detail, status changes, edit, reply analysis, CV tailoring, CV/cover autosave, profile/master CV sync, calendar navigation/export, studio, insights, people, settings, capture, CSV import, backup/restore, reset, print, share target, offline reload, archive/restore, delete, notification fallback.
- Responsive checks at 390, 360 and 320 px across all primary routes.
- Lighthouse accessibility, best practices and SEO audits.
- Service worker cache version check after asset changes.
