# WriteSpace

Browser-local React 18 / JavaScript / Vite / Router 6 / Tailwind 3.4 writing demo. This slice implements **public discovery only**: landing, role-aware presentational links, real stored-post previews, and an explicit not-found destination. Identity, reading, authoring and administration pages are not implemented yet. Links keep their final contract destinations but currently reach the honest not-found page. No pretend feature screens are provided.

## Safety and persistence

The upstream demo design intentionally uses unsafe fixed **admin / admin** credentials and **plaintext stored passwords** in the later identity slice. Never enter real passwords or sensitive information. This discovery build does not authenticate or create accounts.

All product data is browser-local `localStorage`, user-editable and exposed to same-origin scripts. Clearing browser data, switching browser/profile/origin/port, private browsing, quota errors or denied storage can lose/hide data. There is no sync, backup, recovery, API, database, encryption or **server security**. Future route/role checks are client UX only, not trusted authorization. Hosting serves static files only.

## Local setup (Node 20.19+; pinned container uses Node 22.14)

From workspace root:

```sh
cd frontend
npm ci --no-bin-links
# Optionally copy .env.example to .env using your editor or platform file manager.
npm run dev
```

Default dev URL: http://localhost:5173. `VITE_DEV_PORT` and `VITE_PREVIEW_PORT` configure strict dev/preview ports; dummy defaults are documented in `frontend/.env.example`. No client secrets or product network environment variables exist. Scripts use direct Node entry paths, not missing npm bin links. Fontsource Outfit (display) and Source Sans 3 (body) are bundled and self-hosted, not remotely requested.

## Build and tests

From `frontend`:

```sh
npm run build
npm run preview
npm test
```

Build directly: `node node_modules/vite/bin/vite.js build`. Discovery-only unit/component verification:

```sh
node node_modules/vitest/vitest.mjs run src/utils/storage.test.js src/utils/presentation.test.js src/components/PublicNavbar.test.jsx src/components/BlogCard.test.jsx src/components/Avatar.test.jsx src/pages/LandingPage.test.jsx
```

Vitest uses RTL/jsdom, real jsdom storage for normal paths, and explicit browser-boundary fault injection. It excludes `e2e`.

**E2E files are written, NOT RUN by this discovery builder.** The parent owns review, browser execution, production build/container verification and commits. To execute later from frontend:

```sh
node node_modules/@playwright/test/cli.js install chromium
node node_modules/@playwright/test/cli.js test
```

Playwright uses JavaScript, one worker, a direct Vite webServer, `PLAYWRIGHT_BASE_URL` (default http://127.0.0.1:5173), automatic pre-navigation console/page-error capture and zero-error assertions. Only first entry uses `page.goto`; subsequent app routes use links. Browser fixtures seed real localStorage without mocking product calls. Screenshots, ariaSnapshot, HTML and computed/loaded-font data are attached for parent review. Current journeys expect unavailable destinations, not a simulated login/reader; the parent must update those assertions when later slices wire routes. Run against a local frontend HTTP base URL; the webServer port follows that URL.

## Container and static hosting

From workspace root:

```sh
docker build -t writespace-local frontend
docker run --rm -p 8080:80 writespace-local
# In another terminal:
curl -I http://localhost:8080/
curl -I http://localhost:8080/blog/example
curl -I http://localhost:8080/assets/missing.js
```

Expected static behavior: root 200, direct client route 200 SPA shell, missing asset 404. Docker uses pinned Node → nginx images, `npm ci --no-bin-links`, and direct Node build. This builder did not run build/container smoke tests. Root `vercel.json` has only the mandated `/(.*)` → `/index.html` rewrite. For Vercel configure the project root as `frontend`, output as `dist`, and ensure the root rewrite is included in deployment configuration; no deployment is claimed here.

## Extension conventions

- `main.jsx` mounts StrictMode and BrowserRouter exactly once; `App.jsx` owns routes only. No auth inference in discovery App. Future identity supplies validated nullable `session` props.
- Pages default-export; shared components are named `PublicNavbar`, `BlogCard`, `Avatar`. `Avatar.jsx` also named-exports `getAvatar(role)` returning static JSX. Roles are case-sensitive `Admin` and `user`; unknown avatar role defaults to writer.
- `PublicNavbar({ session = null })`: guest Login/Get Started; signed-in Go to Dashboard targets Admin `/admin` or user `/blogs`. `LandingPage({ session = null })`: Start Reading targets `/blogs` for either session role, otherwise `/login`; Get Started Free always `/register`.
- `BlogCard({ post = null, index = 0 })`: title link to encoded `/blog/:id`, exact first 120 content characters, UTC date and author. Invalid IDs are non-clickable; unknown fields degrade without changing stored records. Four border accents repeat; invalid indices use indigo.
- `storage.js` named exports `getPosts`, `savePosts`, `getUsers`, `saveUsers`, `readValue(key, fallback = null)`, `writeValue(key, value)`, `removeValue(key)`. List getters preserve valid arrays verbatim, otherwise `[]`. Writes/removes return `{ ok: true }` or `{ ok: false, error: string }`; errors are generic. Generic reads accept any parsed JSON; **later auth must validate session shape and fail closed**. Keys: `writespace_posts`, `writespace_users`; future auth owns `writespace_session` through generic functions. No render writes, silent repairs or module-cache state.
- `presentation.js`: named `newestFirst(posts)` (copy, stable ties, invalid dates last), `formatDate(value)` (English UTC `MMM DD, YYYY` or `Unknown date`), `safeText(value, fallback = '')` (strings only, no object coercion).
- Only useState/useEffect; JSX one element per line; module/function JSDoc and component PropTypes. Focus-visible controls and reduced-motion CSS. Light Slate hero, supplied indigo/violet accents, required em-dash empty copy and avatar emojis are documented upstream visual exceptions.

## Builder diagnostic status

Dependency installation succeeded. Initial install reported 17 vulnerabilities; after refreshing Router/Vite/Vitest/Playwright/PostCSS pins, the final npm summary still reports **15 vulnerabilities (6 moderate, 7 high, 2 critical)**. This is unresolved: the parent should inspect the advisory details and update the dependency tree before distribution. No audit fix command was run.

The refreshed tree initially failed Vitest startup because the sandbox could not resolve esbuild 0.25.12's native executable. An optional-dependency reinstall did not resolve it. A compatible pinned `overrides.esbuild: 0.25.2` plus `npm install --no-bin-links --include=optional --ignore-scripts=false --foreground-scripts` ran postinstall and recovered execution. Do not copy node_modules across platforms; use the lockfile to install on the target platform.

Final discovery diagnostics (Vitest 3.2.6, exit 0, no stderr):

```text
✓ src/utils/storage.test.js (41 tests)
✓ src/utils/presentation.test.js (22 tests)
✓ src/components/PublicNavbar.test.jsx (5 tests)
✓ src/components/BlogCard.test.jsx (16 tests)
✓ src/components/Avatar.test.jsx (5 tests)
✓ src/pages/LandingPage.test.jsx (12 tests)
Test Files  6 passed (6)
Tests       101 passed (101)
Duration    26.84s
```

No E2E, build, container, git, publishing or deployment execution is claimed. The parent owns final verification and commits; `todos.yaml` remains unchanged.
