# Contributing to Kazi

Thanks for wanting to make Kazi better. It is a small, zero-dependency, local-first app, and contributions of every size are welcome.

## Ways to help

- Use it and tell us where it is confusing.
- Report a bug with steps to reproduce.
- Suggest a feature or a parser rule.
- Improve copy, accessibility or the visual system.
- Send a pull request for a fix or a feature.

For anything larger than a small fix, open an issue first so we can agree on the shape before you spend time.

## Ground rules

Kazi is built around a few promises. A change should keep them:

1. **Local-first.** Records stay in `localStorage`; attachments stay in IndexedDB. No account or server database.
2. **Private by default.** No analytics, trackers, third-party fonts, CDNs or background network calls. AI stays opt-in and off by default.
3. **No key in the browser.** AI calls go through `api/ai.js`; keys live in server environment variables.
4. **Works offline.** The shell is precached by `sw.js`; new runtime assets need a cache version bump.
5. **Phone first.** Test at 390px wide before desktop.
6. **Accessible.** Keyboard reachable, visible focus, sensible labels, contrast, reduced motion.
7. **Calm design.** Bone/ink ground; cobalt only for actions; marigold only for time; muted red only for dated consequences. Archivo + IBM Plex Mono. No shadows, gradients, generic pills or radii above 4px.
8. **No new dependencies without discussion.** The app is plain HTML, CSS and ES modules with no build step. A dependency needs a very good reason.

## Set up

Fork the repository, then:

```bash
git clone https://github.com/<your-user>/kazi.git
cd kazi
npm run serve
# open http://localhost:4180
```

There is no install step and no build. If you do not have npm, `python3 -m http.server 4180` works.

Run the checks before opening a pull request:

```bash
npm test
for file in js/*.js api/*.js sw.js; do node --check "$file"; done
```

## Where things live

| Path | What it does |
| --- | --- |
| `index.html` | App shell, navigation, SVG sprite |
| `js/app.js` | Routing, views, forms and interactions |
| `js/store.js` | State, persistence, migrations, demo data, export |
| `js/parse.js` | Pure job/reply/date parsers |
| `js/cv.js` | CV and cover rendering, keyword tailoring |
| `js/ai.js` | Opt-in AI client |
| `api/ai.js` | Server-side AI proxy |
| `steady.css` | Active visual system |
| `sw.js` | Offline shell and share target |
| `tests/parse.test.mjs` | Parser tests |

The README has the full project map and the data/privacy model.

## Add a parser rule

`js/parse.js` is pure: text in, fields out. No DOM and no network.

1. Add the smallest rule that covers the real message shape.
2. Add a test to `tests/parse.test.mjs` with a realistic example.
3. Keep existing fields stable; do not let a new rule overwrite a value the user has edited.
4. Run `npm test`.

If a rule is specific to one job board, keep it narrow and document the example in the test.

## Add a feature

1. Open an issue describing the problem, not only the solution.
2. Keep state changes in `js/store.js` and add a migration if the stored shape changes.
3. Keep the feature usable offline and without AI.
4. Test at 390px and at desktop width.
5. Check keyboard order, focus, labels, contrast and reduced motion.
6. Update the README if behavior or setup changes.
7. If you add or rename a precached file, bump `CACHE_NAME` in `sw.js`.

## AI changes

AI is optional. A contribution must not make it required, send data in the background, or put a provider key in client code. Test both paths: with `AI_API_KEY` unset (local fallback) and with a mock or real provider. Never commit `.env` files or keys.

## Pull requests

Keep a pull request focused. Describe:

- the problem and the change,
- what you tested and on which browser/device,
- anything that affects privacy, storage, accessibility or offline behavior.

Small, clear pull requests are easier to review and merge.

## Questions

Open an issue or start a discussion. Be decent; assume good faith.
