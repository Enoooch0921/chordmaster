# ChordMaster — notes for Claude

## Release / push workflow (IMPORTANT)
- **Only bump the app version in `package.json` (`version` field) when pushing to GitHub. Do NOT bump for intermediate work like `npm run ipad:sync`, local rebuilds, or any flow that doesn't end in a push.** Include the bump in the commit being pushed.
  - Default to a patch bump (e.g. `0.8.9` → `0.8.10`). Only do a minor/major bump if the user asks.
  - `package.json` `version` is the single source of truth: `vite.config.ts` injects it as the `__APP_VERSION__` define, which `src/constants/appMeta.ts` exposes and the UI shows (e.g. "v0.8.9"). The user uses this visible version to confirm a deploy/build actually updated.

## Build / sync / check
- Type-check: `npm run lint` (runs `tsc --noEmit`)
- Web build: `npm run build` (base `/chordmaster/`, for GitHub Pages / web deploy — this is what setlist *share links* use)
- iPad (Capacitor) build + sync: `npm run ipad:sync`, then run from Xcode

## Gotchas
- **Capacitor base must stay `/`** in `vite.config.ts`. Using `./` makes `import.meta.env.BASE_URL` = `/./`, so `<BrowserRouter basename="/./">` matches nothing and the native app shows a white screen.
- The share page (`src/pages/SharedChartPage.tsx`) is web-facing; its fixes require deploying the **web** build, not the iPad sync.
