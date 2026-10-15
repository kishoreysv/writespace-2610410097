# WriteSpace

A browser-local writing demo built with React 18, JavaScript/JSX, Vite, React Router DOM v6 and Tailwind CSS. Includes public discovery, local registration/login, persistent local sessions, guarded post collection/reader, owner-aware create/edit/delete, and administrator dashboard/account management.

## Demo safety

**Never use real/reused passwords or sensitive data.** Fixed demo administrator credentials are `admin` / `admin`. All account passwords are stored in plaintext in browser `localStorage`. Roles, sessions and ownership controls are bypassable client-side UX, not trusted authorization. There is no backend, API, database, shared publishing, sync, encryption, backup or remote recovery. Clearing storage or changing browser/profile/origin loses access to that local dataset. Concurrent tabs can overwrite one another.

## Run locally

Requires Node 20.19+ (the image builds with pinned Node 22.14).

```sh
cd frontend
npm ci --no-bin-links
npm run dev
```

Dev URL: `http://localhost:5173`. Optional `.env` values are documented with runnable dummy defaults in `frontend/.env.example`: `VITE_DEV_PORT`, `VITE_PREVIEW_PORT`. These configure development servers, not product services or secrets. The static app needs no runtime credentials or API URL. Outfit and Source Sans 3 fonts are bundled/self-hosted.

## Routes and behavior

| Route | Behavior |
|---|---|
| `/` | Public hero, three feature cards, up to three newest local previews |
| `/login`, `/register` | Guest-only; authenticated identities redirect to role home |
| `/blogs`, `/blog/:id` | Authenticated collection and escaped plain-text reader |
| `/write`, `/edit/:id` | Create for either role; edit for owner or administrator |
| `/admin`, `/users` | Administrator-only dashboard and accounts |

Writers go to `/blogs`, administrators to `/admin`, guests attempting protected routes to `/login`. Logout removes only `writespace_session` and returns `/`. Post deletion requires native confirmation and returns `/blogs`. Failed storage writes/removals do not claim success or erase the current form/view. Passwords are never listed or logged.

The three local keys are `writespace_posts`, `writespace_users`, and `writespace_session`. Reads contain malformed JSON/access errors without repairing stored bytes. Mutations reread the current records and session before checking permissions.

### Inferred decisions in this unattended build

Username comparison is case-insensitive after trimming; `admin` is reserved. Names/usernames are trimmed, passwords remain exact. Blank/whitespace-only writing is rejected with no maximum text length. Administrator-created admin accounts can sign in locally. Cancel/back targets `/blogs`; guest login never resumes a preview. Dates use UTC English `MMM DD, YYYY`; invalid dates show `Unknown date`. Partial registration retains a saved account when session persistence fails and offers real sign-in recovery.

Dashboard labels preserve the upstream case distinction: `Total Posts` counts displayable posts, `Total Users` counts stored accounts, `Total Admins` counts stored administrators plus the fixed demo identity, and `Total users` counts writer-role accounts. On-screen descriptions clarify these inferred formulas. The public hero uses a light Slate surface rather than the prohibited full-page rainbow gradient.

## Build and tests

From `frontend`:

```sh
npm run build
npm run preview
npm test
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

Scripts use direct Node package entries, so they work with bin links disabled. Vitest/React Testing Library/jsdom tests live beside modules. Playwright specs live in `frontend/e2e`, with one worker and automatic browser console/page-error failure capture. The config starts Vite unless a server is already available at `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:5173`). To test the production preview:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:e2e
```

On the pipeline's Ubuntu 26.04 sandbox, Chromium required `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` and standard browser libraries/fallback fonts. Normal supported systems do not need that override. Browser fault tests inject only native storage-boundary exceptions allowed by the LLD; auth/post/account operations remain real. Test profiles use disposable synthetic data.

### Verified results

- Unit/components: final full suite passed **729 tests across 22 files**, with zero failures or skips. Two logout race regressions failed before the source fix and passed afterward.
- Browser journeys: all 54 cases verified. First full run passed 48 and exposed a logout routing race; source was fixed and all 39 cases in affected identity/authoring/admin specs passed on the targeted rerun. Discovery and reading had passed unchanged.
- Read-only test critic: PASS, score 1.00, zero high failures after coverage/source fixes.
- Production Vite build and Docker image build passed.
- nginx smoke: root and six deep paths return SPA shell with 200; missing assets return 404; HTML `Cache-Control: no-cache`.
- Accessibility-tree, HTML and computed-font preflight passed for desktop/mobile empty/populated/navigation states; screenshots saved for review.

No backend/API/database integration tests apply. AWS deployment is owned by downstream DevOps; no live deployment or performance SLO is claimed here.

## Static container and deployment

From repository root:

```sh
docker build -t writespace-local frontend
docker run --rm -p 8080:80 writespace-local
```

The two-stage image serves only `frontend/dist` with nginx on port 80, bound to all interfaces. Health path is `/`. `frontend/nginx.conf` supplies SPA fallback, preserves missing-asset 404s, revalidates HTML and permits immutable hashed assets. No proxy to a phantom backend exists; no browser records live in the image. Delivery rollback restores code, not local data.

The pipeline target is AWS ECR → ECS frontend service → shared ALB → CloudFront. `vercel.json` retains exactly the upstream sole SPA rewrite; if using Vercel separately, configure project root/output/build for the nested `frontend` directory and ensure that rewrite is applied. No infrastructure account IDs or deployment credentials are embedded.

## Dependency audit warning

The current lockfile reports **12 advisories: 5 moderate, 5 high, 2 critical**. Runtime-only audit reports two moderate Router v6 advisories (`GHSA-wrjc-x8rr-h8h6`, `GHSA-337j-9hxr-rhxg`); remaining issues involve development tooling/transitive dependencies, including Vitest/Tinypool and Tailwind's glob/parser chain. Compatible Router v6, Vite and PostCSS patches were applied. Remaining recommended remediation requires major-version changes, including Router v7, conflicting with the specified v6 stack. Do not expose development/test servers publicly or treat this demo as production-secure; review and approve upgrades before broader distribution. The esbuild override pins a compatible executable version; use clean `npm ci` rather than copying dependency trees across systems.

## Source organization

`src/App.jsx` composes routes; `main.jsx` owns one StrictMode/BrowserRouter mount. Pages own transient state with `useState`/`useEffect`; components handle reusable presentation. `utils/storage.js` is the guarded native-storage boundary, `auth.js` identity/routes, `posts.js` post mutations, `accounts.js` admin mutations, and `presentation.js` safe text/date/sorting/author role. Stored roles are lowercase `admin`/`user`; avatar presentation adapts administrator treatment without changing record schemas.
