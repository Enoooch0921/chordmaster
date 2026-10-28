---
version: 1
slug: "src-pages-sharedchartpage-tsx"
primary_target: "src/pages/SharedChartPage.tsx"
related_targets: ["src/components/InvitationPage.tsx", "src/components/InvitationTransition.tsx", "src/styles/invitation.css", "src/lib/invitationJourney.ts", "src/pages/AuthCallbackPage.tsx", "src/lib/auth.ts", "src/hooks/useSetlistNavigationMemory.ts", "src/App.tsx", "src/main.tsx"]
---

# Setlist and project invitations

Mode: Operate. Invitation-only extension of the established ChordMaster green workspace, code-led. The user approved the invitation composition and Google departure/return, join-and-open and existing-member App arrival in `/Users/zhangenchi/.codex/visualizations/2026/10/28/01a18157-c024-7242-90f7-9f9a802b087e/invitation-transition.html`. This is a local flow, not a replacement visual identity. Preserve `DESIGN.md`, `.impeccable/design.json`, the ordinary workspace and existing song/song-bundle sharing.

THESIS: Make the real invitation and the next account action clear, then carry that same invitation into the correct working context.

OWN-WORLD: Inherit green-700 actions with green-800 hover, semantic light/dark surfaces, borders and text, the existing Inter/Traditional Chinese sans-serif character, quiet divided rows and native controls. The invitation's local heading sizes, 16px desktop sheet radius, supporting tints and gate are not additions to the global token scales. Use actual share payloads and the signed-in account; no invented inviter, avatar, permissions, song facts or production demonstration data.

STORY: A guest sees the invitation and chooses Google sign-in; Google account selection returns to this invitation before the user explicitly joins. A signed-in non-member joins and opens the resource with one action. An existing member opens it directly. A setlist arrives at its detail/reading context; a project arrives at that project's setlist list. Readiness belongs to the resolved invitation and refreshed destination, including cold startup and warm caches missing newly joined content.

FIRST VIEWPORT: Put the actual resource title first, then invitation type and song/setlist count. Keep the short purpose, signed-in account when available, and a single state-specific primary action above the content preview. Setlists show ordered songs with the effective Key and available finite BPM; archived entries retain their label. Projects disclose their actual setlists and each list's songs. Place synchronization and personal Capo details below the preview, followed by live refresh status. Empty resources explain their actual empty state. Language selection remains available in the header.

FORM: One calm continuous sheet, at most 500px wide on desktop, with a thin semantic border and 16px corners; at widths up to 520px it becomes an edge-to-edge page. Body insets are 28px on desktop, 24px on phones and 16px below 359px. Resource titles wrap, with local 28–34px semibold type; song names and long account names wrap without clipping. The full-width green action is at least 50px high with 12px corners. Language control is at least 44px and disclosure summaries at least 48px. At 320px, Key/BPM moves below the song title rather than forcing horizontal overflow. Honor safe areas, native scrolling and both themes. Project disclosures and synchronization details remain native `details`/`summary` elements.

## Invitation-only motion contract

- Entry points are explicit actions on a resolved setlist/project invitation and a validated return from that invitation's Google sign-in. A URL alone never starts a journey. Normal App startup, normal sign-in, refresh, routine navigation and song/song-bundle sharing do not receive this transition.
- Keep the transition provider above route content and lazy App loading. For pointer activation, grow the initiating button into a full opaque green cover over 500ms, hold the settled cover for at least 200ms, then open the two leaves over 650ms only after the exact destination is ready. The content enters with the reveal. Google departure settles under the same cover before handing control to the external browser; the external Google page remains outside app control.
- A setlist/project App arrival exists only in provider memory. Google return context is tab-scoped `sessionStorage` on the web and bounded `localStorage` in Capacitor. Validate resource kind, identifiers, language, motion and exact invitation path; consume the marker once, reject future/expired timestamps, and expire it after ten minutes. Ordinary sign-in and failed OAuth clear the marker. Reload/history restoration cannot replay the App arrival.
- Readiness checks must wait for authentication/membership on the invitation and for the correct refreshed workspace, target and navigation state in App. Stale startup caches and remembered navigation must not uncover another project or setlist. Changed join-response IDs fail instead of silently opening another resource.
- Keyboard activation is immediate with no spatial animation. Reduced motion uses the quiet semantic cover and a 125ms opacity transition. If Reduce Motion becomes active during cover, Google handoff, loading, hold or reveal, cancel active spatial animations and continue without residual clipping or transforms.
- Route content is inert and hidden from assistive technology while covered. After the cover and inert state are removed, focus the invitation title on return; in App, focus the visible project title, setlist title, or labelled setlist reading pane for a closed/phone sidebar. Keep visible focus on interactive controls. Cancellation restores a connected trigger when available.
- Prevent duplicate actions and ignore stale completions. Errors restore actionable invitation feedback or provide a return path; after twelve seconds, the covered state offers “Back to invitation.” Returning from native browser cancellation or browser page restoration clears the pending cover. In-app browsers that block Google sign-in receive open-in-browser/copy-link guidance.

## Operational boundaries

Keep existing sharing RPCs, permissions, Google account chooser, share refresh behavior and personal Capo semantics. This work does not change the backend, schema or score data and does not authorize deployment. Synthetic verification fixtures remain isolated from production credentials and repositories. Do not copy fixture song names or accounts into production content.

QUALITY BAR: Confirm guest, signed-in non-member and existing-member states for both resource kinds; Google departure/return, empty/error/slow states, repeat-action protection, stale cache routing, correct arrival focus, live reduced motion and keyboard immediacy. Verify desktop, phone, 320px, Chinese/English and light/dark rendering. Test normal startup/login/refresh/navigation for absence of invitation animation.

FINISH: Source and rendered evidence are recorded in `.impeccable/review/invitation-20261028/verification.md`; the system comparison is in `documentation.md` beside it. Keep invitation-local detector advisories local. Live Google OAuth and physical Capacitor behavior require device/account verification beyond the isolated synthetic harness; no such coverage is implied by screenshots or unit tests.
