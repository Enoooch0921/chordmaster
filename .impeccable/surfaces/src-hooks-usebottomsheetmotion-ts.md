---
version: 1
slug: "src-hooks-usebottomsheetmotion-ts"
primary_target: "src/hooks/useBottomSheetMotion.ts"
related_targets: ["src/components/PreviewWysiwygEditor.tsx","src/App.tsx","src/hooks/useAppViewport.ts","src/index.css"]
---

# Mobile details sheet and contained app viewport

Mode: Operate. Preserve current song-info design and editing behavior.
THESIS: Song details belongs to a bottom sheet; the installed app frame stays still while its own panes scroll.
OWN-WORLD: Current green/semantic light-dark surfaces, continuous tabs, protected focus and scroll position.
STORY: Details enters from bottom, follows downward finger on handle or content already at top, springs back for a short pull, dismisses for distance/flick, and exits downward. Scrolled content keeps scrolling; inputs and tab controls do not start a drag.
FIRST VIEWPORT: Header and backdrop remain anchored; sheet entrance240ms and exit200ms use drawer ease(0.32,0.72,0,1); gesture cancellation uses existing Motion spring duration0.5/bounce0.2; reduced-motion replaces automatic sliding with opacity. All values from animate skill.
FORM: Reuse one sheet gesture/animation hook across both existing mobile detail entries. Keep focus trapped/restored and data saved as before. Fixed viewport/root scrollers and edge overscroll containment, plus visual viewport lifecycle resync for keyboard and standalone resume. No backend changes.
QUALITY BAR: Real browser touch paths prove inside scrolling, top-edge dismiss, cancel, reduced motion, no background/page movement and unchanged pinch focal accuracy. Standalone mode is browser-emulated; no physical iOS installed-app claim.
FINISH: Independent review of rendered cases and updated design behavior documentation.
