---
name: "ChordMaster"
description: "Green musical workspace for worship charts and complete editing."
colors:
  green-50: "#F0FAF5"
  green-100: "#DAF1E5"
  green-200: "#B6E3CA"
  green-300: "#8AD0AC"
  green-400: "#5EBD8F"
  green-500: "#3DAA78"
  green-600: "#2E8C5E"
  green-700: "#236E48"
  green-800: "#1A5234"
  green-900: "#1A3A2A"
  green-950: "#0D1F17"
  surface: "#ffffff"
  surface-muted: "#f9fafb"
  surface-sunken: "#f3f4f6"
  surface-raised: "#ffffff"
  border: "#e5e7eb"
  border-strong: "#d1d5db"
  text: "#111827"
  text-muted: "#4b5563"
  text-faint: "#9ca3af"
  text-inverse: "#ffffff"
  surface-dark: "#161b22"
  surface-muted-dark: "#0d1117"
  surface-sunken-dark: "#0a0d12"
  surface-raised-dark: "#1c2128"
  border-dark: "#30363d"
  border-strong-dark: "#484f58"
  text-dark: "#e6edf3"
  text-muted-dark: "#9ba1a8"
  text-faint-dark: "#6e7681"
  text-inverse-dark: "#0d1117"
  success: "#2E8C5E"
  success-soft: "#DAF1E5"
  success-soft-dark: "#1A5234"
  danger: "#e11d48"
  danger-dark: "#f43f5e"
  danger-soft: "#ffe4e6"
  danger-soft-dark: "#4c1024"
  feedback-emerald-surface-dark: "#102c23"
  feedback-emerald-text-dark: "#a7f3d0"
  feedback-emerald-border-dark: "#22583e"
  feedback-sky-surface-dark: "#102a3f"
  feedback-sky-text-dark: "#bae6fd"
  feedback-sky-border-dark: "#20445d"
  feedback-amber-surface-dark: "#342811"
  feedback-amber-text-dark: "#fde68a"
  feedback-amber-border-dark: "#66501f"
  feedback-rose-surface-dark: "#351b25"
  feedback-rose-text-dark: "#fecdd3"
  feedback-rose-border-dark: "#6b2b40"
  white: "#ffffff"
typography:
  song-title:
    fontFamily: "Inter, PingFang TC, Hiragino Sans GB, Microsoft JhengHei, Noto Sans CJK TC, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  panel-title:
    fontFamily: "Inter, PingFang TC, Hiragino Sans GB, Microsoft JhengHei, Noto Sans CJK TC, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "28px"
    letterSpacing: "-0.025em"
  control:
    fontFamily: "Inter, PingFang TC, Hiragino Sans GB, Microsoft JhengHei, Noto Sans CJK TC, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: "20px"
  field:
    fontFamily: "Inter, PingFang TC, Hiragino Sans GB, Microsoft JhengHei, Noto Sans CJK TC, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "24px"
  tab:
    fontFamily: "Inter, PingFang TC, Hiragino Sans GB, Microsoft JhengHei, Noto Sans CJK TC, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  label:
    fontFamily: "Inter, PingFang TC, Hiragino Sans GB, Microsoft JhengHei, Noto Sans CJK TC, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0em"
  row-title:
    fontFamily: "Inter, PingFang TC, Hiragino Sans GB, Microsoft JhengHei, Noto Sans CJK TC, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  row-meta:
    fontFamily: "Inter, PingFang TC, Hiragino Sans GB, Microsoft JhengHei, Noto Sans CJK TC, Noto Sans TC, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "20px"
rounded:
  field: "10px"
  control: "12px"
  sheet: "24px"
  pill: "9999px"
  keyboard-utility: "11px"
  voice-control: "8px"
spacing:
  compact: "8px"
  field-inset: "12px"
  column-gap: "16px"
  sheet-inset: "20px"
  section: "24px"
  layout-group: "28px"
  key-gap: "6px"
components:
  button-primary:
    backgroundColor: "{colors.green-700}"
    textColor: "#ffffff"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.green-800}"
  button-login:
    backgroundColor: "{colors.green-700}"
    textColor: "#ffffff"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.field}"
    height: "48px"
  input-mobile:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "0 12px"
    height: "48px"
  tab-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.green-700}"
    typography: "{typography.tab}"
    height: "48px"
  chip-workspace:
    backgroundColor: "{colors.green-50}"
    textColor: "{colors.green-700}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sheet}"
  switch-track:
    backgroundColor: "{colors.border-strong}"
    rounded: "{rounded.pill}"
    height: "24px"
    width: "40px"
  switch-track-on:
    backgroundColor: "{colors.green-700}"
  switch-thumb:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.pill}"
    size: "20px"
  keyboard-key-active:
    backgroundColor: "{colors.green-700}"
    textColor: "{colors.white}"
    rounded: "{rounded.keyboard-utility}"
    height: "48px"
  voice-choice:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.voice-control}"
    padding: "0 10px"
    height: "44px"
  voice-choice-selected:
    backgroundColor: "{colors.green-100}"
    textColor: "{colors.green-800}"
    rounded: "{rounded.voice-control}"
    padding: "0 10px"
    height: "44px"
  mobile-song-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    padding: "12px 0"
  mobile-row-picker:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    rounded: "{rounded.voice-control}"
    padding: "0 12px"
    height: "44px"
---

# Design System: ChordMaster

## Overview

**Creative North Star: "ChordMaster green workspace"**

ChordMaster retains its existing green musical workspace: a quiet, practical interface around charts, musical settings and editing. Inter and Traditional Chinese sans-serif fallbacks carry the UI; musical notation and printable charts keep their own specialist typography. This document records the implemented system rather than establishing a new identity.

Mobile reading and full editing have equal importance. Controls remain legible and reachable while overlays preserve the underlying chart position. Semantic surfaces support light and dark themes; a restrained green accent identifies actions and selection. Theme choice can be light, dark or system-following, with interface and native form-control color schemes kept in sync. Charts keep chords and their corresponding lower notation together as one readable musical unit.

**Key Characteristics:**
- Existing green identity with semantic light/dark surfaces.
- Compact desktop tools and larger mobile editing controls.
- Clear labels, rounded fields and restrained borders.
- Independent overlay scrolling with persistent chart position.

## Colors

Green is the existing action and selection accent, supported by semantic neutral layers. Frontmatter values are normative. Names ending in `-dark` record the values assigned to the corresponding semantic role by `.dark`; they are not separate runtime CSS variable names.

### Primary

- **ChordMaster Green:** the `green-*` scale corresponds exactly to the `--color-indigo-*` declarations in `src/index.css`. Solid primary actions use green-700 and hover to green-800. Fields and selected tab underlines use green-600; focus uses green-500. Dark selected tab text uses green-400.
- **Soft Green:** green-50 and green-100 provide light selected fills and supporting badges. The full existing scale is recorded so legacy indigo utilities retain their meaning.

### Neutral

- **Surface:** cards and editing sheets. **Muted Surface:** the page and mobile field backgrounds. **Sunken Surface:** deeper containers. **Raised Surface:** popovers and selected segments. The light surface and raised surface happen to share a value; dark mode separates them.
- **Border / Strong Border:** quiet separation and stronger field outlines.
- **Text / Muted Text / Faint Text:** primary content, supporting labels and low-priority hints. Inverse text is a semantic role that changes with the theme; primary green buttons explicitly retain white text in both themes.

### Feedback

- **Success:** green feedback with a soft fill; the soft role changes in dark mode.
- **Danger:** rose feedback with separate light and dark foreground and soft-background values. These are feedback roles, not a second brand accent.
- **Compatibility Feedback:** emerald, sky, amber and rose retain distinct semantic tint families in dark UI. The frontmatter records the surface, foreground and border values used by `src/styles/dark-ui.css`. Dedicated component dark variants retain authority over this fallback layer.

The compatibility layer translates supported legacy gray, slate and stone utilities into semantic text, surface and border roles, including translucent fills. It excludes `[data-print-preview]` and its descendants, and skips properties with dedicated dark variants. New components should use semantic roles directly. The phone ChordMaster wordmark follows the primary text role.

**The Paper and UI Rule.** Theme changes affect interface chrome while printable chart paper and ink retain their established palette.

**The Semantic Surface Rule.** Use surface, border and text roles for theme-aware UI; the dark theme changes their values rather than the meaning of the roles.

**The Inherited Green Rule.** Existing indigo-named utilities resolve to the ChordMaster green scale. Preserve that mapping when extending the app.

System-following theme mode responds to OS preference changes and resynchronizes on page restoration, focus and visible-page changes. The root dark class and native `color-scheme` update together before paint; explicit light and dark choices remain user overrides.

## Typography

**UI Font:** Inter with PingFang TC, Hiragino Sans GB, Microsoft JhengHei and Noto Traditional Chinese fallbacks, as recorded in the frontmatter. There is no newly introduced display face.

**Chart Fonts:** the existing serif stack begins with IBM Plex Serif. Music uses NotoMusic, rhythm uses Bach with NotoMusic fallback, and jianpu uses JianpuASCII. Preserve their notation roles; they are not UI heading alternatives.

### Hierarchy

- **Song Title:** prominent editable name, semibold (20px, 600).
- **Panel Title:** compact mobile overlay heading, bold (18px, 700, 28px line height).
- **Control:** primary action text (14px, 700, 20px line height).
- **Field:** mobile text-entry value (16px, 500, 24px line height), keeping editable content easy to read.
- **Tab:** direct section destinations (13px, 600).
- **Label:** explicit field descriptions with ordinary casing and no added tracking (12px, 500).
- **Row Title:** project names and incumbent mobile rows, semibold (16px, 600, 24px line height). The current setlist reading area uses the local title treatment described under Setlist Song and Project Rows.
- **Row Metadata:** original musical facts and project counts (12px, 400, 20px line height).

These roles describe the finished mobile controls. Dense desktop tools retain smaller incumbent sizes; this pass does not establish those sizes as mobile defaults.

## Layout

The app is a chart workspace with sidebar, toolbar and independently scrollable working areas. The app phone breakpoint is (640px). Preview editing also uses device and touch signals: phone devices select the phone layout, known tablets retain tablet layout, and touch devices up to (1536px) can use tablet controls. The incumbent metadata container also has width modes at (480px) and (820px); these are component thresholds rather than app-wide breakpoints.

Spacing repeatedly uses compact (8px), field inset (12px), column gap (16px), mobile sheet inset (20px), section separation (24px) and layout-group separation (28px). Paired mobile fields use two equal `minmax(0, 1fr)` columns. Maintain shrinking and wrapping behavior for narrow phones.

The screen app frame stays fixed while its own panes scroll. Its height and top follow the visual viewport through resize, focus and page restoration, including the software keyboard. Screen-only body/root containment and single-touch edge handling prevent an exhausted pane from moving the document; multi-touch chart pinches retain their own gesture. Print/export keeps its separate page flow.

Mobile editing uses fixed sheet chrome and an inner `min-height: 0` scroll region with overscroll containment and safe-area padding. The song-information surface uses equal-width tabs, a sticky tab rail and visible completion action; that specific composition is documented in `.impeccable/surfaces/src-components-songmetadatapanel-tsx.md`, not prescribed for every screen. The desktop chart's song-information popover is at most (480px) wide with (12px) viewport margins and bounded to (520px / 70vh). Its complete editor shares the Song, Chart and Audio destinations, while the preview-header variant keeps a two-column form with Capo. Desktop popover fields use a local (36px) height, (12px) labels and (13px) values. The heading stays visible while short viewports scroll the body. Embedded desktop metadata retains its existing compact form.

Rhythm, jianpu and bar-text panels size to their actual content across phone, tablet and desktop. Fixed key-row floors remain intact; a bounded center scrolls independently when the viewport is short while the header and footer stay visible. Empty filler below key rows is not part of this pattern. Phone and tablet panels have a (64px) top allowance; the visual viewport controls width and keyboard offset. Phone chord keys retain their separate flexible dock based on (40dvh) with a (360px) floor. Desktop chord entry with the letter/number rows hidden uses a local utility panel up to (620px) wide and ordinarily (260px) high, bounded by the visual viewport; preserve its header and scroll the middle when space is short. Detailed compositions stay in `.impeccable/surfaces/src-components-preview-edit-previewbareditor-tsx.md` and `.impeccable/surfaces/ts-preview-edit-notationvoiceselector-tsx-8557ca32.md`.

Timed chart rows have content-derived height caps so spare A4 space follows the musical rows rather than stretching their content. Chord-only rows respect the selected height: one-line mode caps at (34px), while default and explicit two-line modes cap at (68px). A normal two-line row with one chord lane and one lower notation lane retains weight (1) and capacity (68px); a second jianpu voice reserves the additional (24px), making the corresponding two-voice row (92px). The verified 40-bar single-melody fixture remains one page. Additional rhythm voices reserve (22px) each and chord-pass rows (36px) each. Explicit three-line handwriting space retains its existing geometry and pagination capacity; only content needing lower notation receives its extra height. These are chart geometry values, not UI spacing tokens. Chord-quality words (m, maj, dim, sus) sit at the lower right; numeric extensions rise by 0.7em into the upper-right band. Alterations follow the extension without covering it. Numeric roots, quality groups and slash basses use intrinsic inline width rather than estimated absolute-position reserves, so long qualities remain separate from bass notes. Degree spelling is semantic content: explicit b6 and #5 must remain distinct through editing and transposition. Two-line timed pages fit at most ten rows using their required pixel heights and conservative music-area budgets (900px first page, 940px continued pages). Gaps reduce from the existing responsive 24px/32px maximum in 4px steps to a 20px minimum before adding a page; bar heights remain intact. A 37-bar chart with a two-voice intro fits one A4 page at 20px gaps. Unmetered/untimed layouts and explicit one-/three-line density retain their existing pagination rules.

For timed bars, lower notation follows the actual chord/pass stack with nominal (7px) token clearance. Ordinary and subdivided chords share the 40px lower-notation anchor: beat labels already fit inside the 32px chord group and do not push rhythm down. The anchor adds (36px) per additional pass row; measure lanes, section gutters and pickup use the same calculation. Untimed and unmetered bars retain their special rendering and do not use the compact anchor or timed-row cap. Detailed composition and fixtures live in `.impeccable/surfaces/src-components-chordsheet-tsx.md`.

Sidebar projects, setlists and songs use flat divided rows rather than nested cards. Project names retain the row-title role; the setlist's current local composition uses a larger song title with original-key, meter, version and translator facts below it. Setlist rows have a broad reading area and a narrow right control rail (88px) stacking Key above BPM. The number/drag target and permitted song-action menu share a line above the title. Count and Add retain their shared header toolbar, and there is no bottom inspector. Expanded desktop and non-phone overlay sidebars share a (420px) minimum including the (80px) navigation rail; the verified desktop render leaves (315px) for each complete song row after insets. Phone sidebar sizing remains viewport-based. The main toolbar retains Key and personal Capo beside tempo; when the tablet main pane is narrower than (960px), it retains the logo and hides duplicate brand/context text so the controls remain reachable through horizontal overflow. This confirmed control-rail direction supersedes the prior published-mobile Key/Capo fields below the title. Other dense desktop typography and project/library layouts retain their existing scale.

## Elevation & Depth

Depth combines semantic tonal layers, thin borders and soft overlay shadows. Fields and sections rely on their fill and separators rather than individual floating cards. The metadata overlay uses Tailwind's `shadow-2xl`; the mobile actions sheet uses the explicit upward shadow recorded in the sidecar. Small action shadows provide light separation without becoming a decorative motif.

**The Chart Position Rule.** Opening and scrolling a mobile editor preserves the background chart position; closing restores access to that same position.

Motion explains occasional surfaces and feedback while reading, notation entry and rapid song choice stay immediate. The common ease-out curve is `cubic-bezier(0.23, 1, 0.32, 1)`; drawers use `cubic-bezier(0.32, 0.72, 0, 1)`. Existing Motion primitives carry the following profiles; no new layout, imagery or brand treatment is implied.

| Interaction | Enter / exit | Motion |
| --- | --- | --- |
| Anchored popover | 160ms / 125ms | Opacity and scale from/to 0.97 around the measured trigger origin. |
| Occasional prompt modal | 200ms / 160ms | Opacity and scale from/to 0.97; backdrop uses the same timings. |
| Mobile sidebar and More actions drawer | 240ms / 200ms | Full transform from/to the drawer edge; sidebar width remains fixed. |
| Workspace, filter and metadata disclosure | 200ms / 160ms | Height from/to zero, with 125ms opacity; height is the accordion exception to transform/opacity motion. |
| Notification | 200ms / 160ms | Opacity and full vertical transform from/to 16px below; entry and exit share the bottom edge. |
| Occasional pointer press | 100ms / 160ms release | Scale to 0.97; no new positional hover motion. |
| Disclosure chevron | 160ms | Rotation follows its disclosure. |

Shared profiles use live reduced-motion preferences: opacity (125ms), with transform duration explicitly zero; disclosure height snaps. Keyboard-initiated shared transitions and chevrons are instant. Changing the preference retargets even a closed sidebar immediately, without animating its hidden position. Pointer press uses opacity (0.8) under reduced motion, and keyboard presses do not acquire the pointer animation.

Gesture-driven mobile/tablet detail sheets retain entry (240ms) and exit (200ms) with the drawer curve, short-pull spring settling (0.5s, bounce 0.2), and their existing reduced-motion opacity path (160ms). Their keyboard entry/dismissal is immediate; direct drag behavior remains intact. Tap-tempo feedback retains its local ease-out pulse (150ms). These are named interaction rules, not one duration applied to every control.

**The Core Work Rule.** Keep score reading, notation input, explicit song selection and core editor geometry immediate; animate occasional panels and feedback only when their spatial or state relationship benefits from it.

## Shapes

Rounded rectangles carry fields and secondary actions, while pill shapes distinguish completion and compact state badges. Mobile fields use (10px) corners, the compact login control uses (12px), and the full metadata sheet uses (24px) top corners on phones. The separate actions sheet retains (28px) top corners. Keep these component distinctions rather than flattening every radius to one value. Thin borders and understated separators structure the editing surface. Phone notation keys retain rounded character keys (12px) and utility keys (11px); these are component shapes, not a new global card treatment.

## Components

### Buttons

Primary mobile actions use green-700, white text and green-800 hover. Done is a pill (44px height, 16px horizontal padding); login is a compact rounded rectangle (44px minimum height, 12px horizontal padding) with a small inline SVG icon. Secondary reference actions use muted surface, muted text, a border and (10px) corners, with a minimum height of (48px). Disabled login reduces opacity and signals unavailable interaction. Buttons and fields inside the mobile metadata content have a green focus-visible outline (2px, 3px offset); the outer completion and login buttons retain browser focus indication.

### Chips

Workspace and original-key badges are compact pill shapes. The active workspace badge uses soft green fill, green text and a light green ring. These convey context rather than introducing another heading tier; tiny desktop badge type is not a general mobile type rule.

### Cards / Containers

Use the semantic surface role and borders for containers. The phone song-information editor is a continuous sheet, with section separators rather than nested cards. Existing desktop metadata uses a bordered, softly shadowed card; keep its density local to desktop. More substantial overlay shadows belong to the outer modal boundary.

### Inputs / Fields

Mobile inputs use muted surface, border, primary text, (10px) corners, (48px) height and (12px) inline padding. Labels and placeholders use muted text. The song-name field is larger and semibold. Key, capo, time-signature and groove controls share the same field silhouette. Focus shifts border/ring to green and retains a visible outline. Semantic roles inherit dark values; do not duplicate theme logic per field.

### Navigation

The song-information tab rail uses a (48px) minimum target, semibold labels, a thin bottom divider and a green underline for the selected item. Dark selected text uses the brighter green role. Selection is exposed by `aria-selected`; arrow keys, Home and End move between tabs. The rail stays at the top of its inner scroll area. Other app navigation retains its incumbent layout.

### Segmented Controls

A muted bordered rail contains pill options. The selected option uses raised surface and green text; inactive options use muted text. In the phone chart settings, options have a (40px) minimum height inside (4px) rail padding, producing a (48px) outer control. Do not generalize the smaller desktop variants to touch screens.

### Switches

The phone groove switch keeps a white thumb in both themes. Its track uses strong border when off and green-700 when on. The track is (40px × 24px), the thumb is (20px), and the on state shifts the thumb (16px). The surrounding (48px) field supplies the hit area, with a native checkbox covering that area. A visible focus ring follows the input. Dedicated track/thumb styles avoid recoloring the white thumb through generic dark utility compatibility.

### Notation Keyboards

Rhythm note/rest rows and jianpu pitch/format rows use (48px) keys. On phones, modifiers occupy two rows totaling (94px), with (44px) keys and a (6px) gap; wider layouts use a single (44px) modifier row. Action rows use (44px). An additional local notation-color row remains (40px) where present. Preserve the row floors and scroll the center instead of compressing adjacent controls. Active keys and forward/Done actions use green-700 with white content. Copy, paste and delete retain distinct semantic tints and their dedicated dark variants.

In desktop chord common mode with letter/number keys hidden, the utility grid uses three rows with a (44px) floor and (8px) gaps. Keep toolbar buttons from shrinking and their labels on one line; the input-mode group remains intact. The usual panel is (620 × 260px) when space permits, with (12px) viewport margins. A short viewport reduces the panel height and scrolls its center, leaving the header visible and the complete color row reachable. The phone retains its existing full docked keyboard. These are local mode dimensions, not a replacement size for rhythm, jianpu, text, unmetered or expanded subdivision editors.

Notation key glyphs retain their specialist fonts and locally chosen sizes; those sizes do not extend the UI type ramp. Existing raised key decoration remains local. Pickup notation lanes share the regular notation marker treatment: a translucent gray background with multiply blending. This is a chart annotation cue, not an app surface color.

### Voice Selection and Bar Text

A horizontal voice selector lives inside the existing notation keyboard. Voice buttons have (44px) height, (8px) corners, semibold small labels and (10px) inline padding. The choice group scrolls horizontally when needed and brings the selected voice into view. Soft green fill and darker green text identify selection in light mode; dark selection uses deep green fill and a pale green foreground. Pencil and add actions remain direct (44px × 44px) controls beside the choice group.

Main and additional voices use the same rhythm or jianpu keys. Selecting a voice keeps the current bar, beat and keyboard context; a thin green ring marks the selected additional chart lane. The pencil expands an inline (44px) name field and Save action. Names apply only to the current bar; removal appears for additional voices. Editing one voice preserves the other lanes and neighboring bars.

For regular bars, the header keeps Chords, Rhythm, Jianpu and Text in the same order in every keyboard. Text is the fourth destination, preserves notation mode and voice selection, and returns to that keyboard. Bar labels, annotations and left/right text belong to the whole bar and are explicitly described as shared by all voices. Voice naming has its own pencil action. Pickup editing retains its specialized rhythm/jianpu header rather than offering unsupported bar-text destinations.

### Detail Sheets

Mobile and tablet song details share the same entry, controlled exit and drag behavior. The sheet completes its exit before unmounting. Late-mounted content attaches to the same motion and focus lifecycle, so lazy loading does not skip the entrance or lose the original opener. Focus stays inside the modal and its portalled pickers, then returns to the opener without moving the chart.

A downward gesture starts on the header/grip or content already at its top. Inputs, links, buttons and tabs keep their own interaction; content that is scrolled away from its top continues native scrolling. A short pull returns to rest; sufficient distance or a downward flick dismisses. Dragging does not move the background app frame or turn its release into a control click.

### Chart Zoom

The score point between two fingers stays under that focal point while the sheet scales and after release, including when the fitted sheet still lies within the viewport. During the gesture the sheet receives one transform update per animation frame; layout and zoom state commit once at release, with only the bounded leading/trailing pan space needed to keep the anchor reachable. Setlist selection tracking and automatic positioning remain paused throughout the gesture.

The pinch owns its native nonpassive capture path only after a two-finger gesture starts. A remaining finger cannot turn the completed pinch into a pan, and the synthetic release click cannot open a notation editor. An ordinary fresh single-finger interaction resumes normally. Resize or chart-identity cancellation restores both the transform and the zoom label. Export clones clear preview translation and use relative positioning with zero left/top offsets so interactive pan does not shift the PDF.

### Setlist Song and Project Rows

Setlist song rows use quiet dividers and a broad reading area beside a stacked right control rail. The reading area has compact insets (8px top, 12px sides, 18px bottom); the complete row has a minimum height of (156px). The semibold title (18px, 26px line height) wraps to at most three lines, and original key, meter, version and translator sit beneath as secondary facts (12px, 18px line height). The current song's (16px) checkmark keeps its own title column. A plain ordinal and (12px) vertical grip share a drag target at least (44 × 44px), with the permitted (44px) overflow trigger opposite it above the title. Read-only roles retain a passive number. The right rail (88px) stacks Key and BPM in separate full-cell targets at least (68px) tall, with ordinary labels (12px) over tabular values (20px; 16px for longer tempo values). Neutral borders separate the cells. Current selection uses the existing deep green reading area with pale green foregrounds and a lighter rail; dark mode uses green-800 for the reading area and green-950 for the rail. A separate (2px) horizontal insertion line identifies a drop target. Keep the rail distinct from the reading area; no leading selection stripe or bottom inspector is introduced.

Key and BPM edits affect their own entry without selecting another song or changing order. Existing key permissions remain separate from tempo's score-edit gate; personal Capo remains in the main toolbar, including for viewers. The handle keeps an inset focus outline; mouse drag starts immediately, touch/pen activates after a hold (180ms), and up/down arrow keys reorder directly. Reordering preserves the selected song, and title/content scrolling stays native. The optional Reorder songs mode replaces the rail with drag and explicit up/down controls; Done and parent navigation leave that mode. Project role choices remain inline text controls. New, Add and Invite use quiet green text with visible focus and existing semantic foregrounds in both themes. The user's explicit adoption of the third live control-rail variant supersedes the earlier published-mobile restoration for song rows only. The legacy frontmatter entries named mobile-song-row and mobile-row-picker describe the prior controls, not this rail; this scoped update does not migrate global tokens or sidecar primitives. Current composition and review evidence are recorded in `.impeccable/surfaces/src-components-projectmanagementpanel-tsx.md`.

Held song drags capture the stationary list pane and use native window pointer listeners, so a reordered handle's DOM movement or lost capture does not terminate the gesture. Reorder callbacks stay current across renders and hit tests remain inside the originating pane. The top/bottom edge zone (48px) auto-scrolls while held, using one animation-frame loop and up to (600px/s); release, cancellation and context changes stop all work and restore text selection. A release click cannot select a different song or open a picker; the next intentional press and keyboard activation remain available. This interaction correction preserves the original contiguous row layout.

Song removal lives behind a labelled (44px) overflow trigger. Its anchored portal menu clamps or flips within the viewport, places focus on the action, dismisses on outside interaction, and returns focus to its trigger on Escape or Tab. The remove action retains the existing native confirmation. Row selection, control edits and reorder preserve their distinct targets.

Owned, read-only and joined projects share the same folder hierarchy: root shows project folders beside loose setlists, folders contain setlists, and setlists contain songs. Folder contents use the same divided rows, selection tint and plain preview text as the root. Members and permissions are managed within the selected project's context: the native role choice shares the name row and email stays beneath; this view does not repeat the project's setlist list. Rename, archive and deletion remain in anchored menus. Existing permissions govern every operation. Sidebar navigation uses explicit dark foreground/selection treatments; Done uses the brighter green-300 role in dark mode.

At the setlist root, one compact row groups the Setlists title, permitted New, Search and More. Search is a magnifier disclosure rather than a permanent field. Inside a project, the browsing header keeps two compact rows: Back, wrapping project name and project-action ellipsis; then setlist count, Members/count or local Manage, permitted New as a plus target, Search and native Sort. Member names remain in the member-management view and in the entry's accessible description/title. All controls retain (44px) targets, including bright green action text on dark surfaces.

Both root and project search expand beneath their toolbar with focus in the field. An empty or whitespace-only search automatically collapses when focus or a completed outside interaction leaves the search field and trigger, without taking focus back. An active text filter remains visible. Finish a pointer click before collapsing the search row so the list cannot move between press and release. Close or Escape clears the filter, collapses the field and returns focus to the search trigger. Loading, failed and empty membership states keep the compact entry, and existing archived recovery stays accessible. This local density refinement preserves navigation motion and chart geometry; its composition and evidence are recorded in `.impeccable/surfaces/src-components-setlistnavigator-tsx.md`.

Folder rows have separate selection and ellipsis targets. The folder and project-title menus make Pin/Unpin and project management discoverable alongside existing permission-scoped rename, archive and delete actions. Root's header menu also opens Project management; Archived projects remains the recovery entry. Personal pins are stored per account/library/browser, including shared folders, and never mutate shared project content or timestamps. Pinned folders lead a stable combined owned/shared list, with a small pin marker beside their name. Native sort presentation remains intentional, including iOS's system menu.

### Tempo Control

The same anchored tempo picker serves the setlist rail and the main toolbar beside Key and Capo. Direct numeric entry supports decimals within (20–400 BPM) and commits on Enter or Apply; an empty value clears the specified tempo. Minus and plus each commit a (1 BPM) adjustment immediately and keep the picker open. Close, outside interaction and Escape discard uncommitted text; invalid input keeps Apply disabled. There is no Tap tempo action in this picker. Show the mutation scope beside the entry: setlist changes update only that entry's song snapshot and undo history, while library-song changes follow the library editor path. Merge tempo into an active preview draft so notation edits survive. Both the control and mutation handler enforce existing score-edit rights, and switching songs resets an open toolbar draft.

Use the existing semantic raised surface, text and border roles. The compact panel is at most (276px) wide with (12px) viewport margins; numeric entry and step targets are (48px) high, and footer actions retain (44px) targets. Apply uses the existing green-700 with white text and green-800 on hover. This is a local control extension; its incidental label sizing, corner radius and shadow are not new global primitives.

### Song Library

The library uses the same flat divided rows as the sidebar, with full-width wrapping titles followed by a fixed (44px) metadata area. Composer/version text or editing presence occupies the first (20px) line; musical facts occupy the second (24px) line. The displayed key leads those facts in a compact neutral tile (26px minimum width, 24px height), followed by tempo and meter. When credits and presence are absent, the facts center within the same metadata area, preserving row height. One labelled overflow trigger (44px) aligns with that lower area as a sibling of the selection button, leaving the title's width available. The current song uses soft green selection; semantic surfaces, text and borders inherit the active theme, with dedicated green and warning foregrounds for dark mode. Library and setlist headers share the quiet muted surface.

The library header has two rows: flexible Search, permitted New song and More on the first; count and native Sort on the second. Keep Song library as a screen-reader heading without a repeated visible title row. At container widths of (300px) or less, New song shows only its plus icon while retaining its full accessible name, tooltip and (44px) target, leaving the search field usable. Viewers receive the full-width search without empty action slots. Search, native sort, row menus, bulk checkboxes and rename fields retain (44px) targets. Header More contains management, permitted import/export operations and Include archived; enabling the latter adds archived songs to the collection and shows “含封存” beside the count. Source-song browsing has no ordinal numbers, per-row Key/Capo editors or bottom inspector.

Batch management exposes selection and inline rename without changing the browsing hierarchy. Selections outside the current search remain in the total and receive an explicit note. Share counts only selected songs in the current results and disables when that count is zero; archive, restore and deletion labels count the full selected set. Permissions continue to govern available actions. The scoped composition and rendered evidence are recorded in `.impeccable/surfaces/song-library-sidebar.md`.

### Anchored Menus, Disclosures and Feedback

Key, Capo, tempo and song-action popovers measure a stationary shell and animate only its visual child. Position and trigger-relative origin are ready before the first visible frame, so scaling cannot change the anchoring measurement. Toolbar and setlist menus use the same popover profile. Key/Capo value commits, tempo Apply and song-action choices close their popovers immediately; tempo step adjustments keep the picker open. Keyboard-initiated shared transitions are instant. Other menu operations execute immediately without waiting for their visual exit.

Presence exits are visual only: departing surfaces become inert and hidden from assistive technology immediately, with pointer interception disabled for surface/backdrop exits. This includes More actions controls. Disclosures likewise make closing content inert while height/opacity finish, preserve their outer composition, and can reverse without a separate staged entrance.

The mobile sidebar uses a fixed-width shell and a full transform on its visual surface; desktop sidebar geometry stays immediate. Core editor panes retain `transform: none`, and their floating selection toolbar has no positional entrance, preserving the fixed keyboard's coordinate space. These rules do not introduce song transitions, list staggers, score/lyrics animation or new pinch choreography.

Notifications keep a stationary outer position-layout wrapper and animate the inner surface. Pending-to-success/error feedback keeps its stable ID and updates in place rather than replaying the entrance. Pointer-only press feedback is reserved for occasional actions; fast notation keys and routine input do not receive added motion. Input modality changes are tracked without making each keystroke rerender the score. Detailed scope and rejected candidates remain in `.impeccable/surfaces/src-components-ui-interactionmotion-tsx.md` and `.impeccable/review/animation-opportunities.md`.

### Chart Preview Consistency

Selected and unselected setlist charts, including export, use the same saved item arrangement when present and fall back to the source song otherwise. Selection must not change the visible arrangement or its page count. This is a consistency rule for existing chart content, not an additional visual token.

Subdivided chord rows and alternative passes keep each beat as a distinct group. Chords within a beat use tight natural-width spacing and share one fit, anchored on the same baseline; beat groups have a larger 6px gap. Dense beats borrow width from sparse neighbors before shrinking, while equally subdivided beats retain equal widths. Condense a beat's chords together horizontally; beyond 2:1 condensation, also reduce their height to preserve recognizable letter shapes. Beat labels counteract the group scaling to stay readable and aligned with their chords. A complete sixteenth run uses “3 e & a”; partial runs and isolated offbeats retain their full beat numbers. Preview and export share this geometry across one-, two- and three-line layouts.

An empty existing bar can be closed from the notation editor's 小節操作 → 關閉此小節 action or from its right-click menu. Closing retains its identity, original slot and the positions of following bars, using the same gray (2px) horizontal line as an unused chart cell. In edit mode the closed cell remains focusable and opens its editor; its hit target also accepts right-click and Command/Ctrl selection like an ordinary bar. 重新開啟小節 restores the empty cell, and entering new content clears the closed state. Closing is disabled when any selected bar contains notation, voices, annotations, saved context or performance instructions. The editor's close action remains outside pickup and individual-voice editing. Rendering checks emptiness again so an imported or stale closed flag cannot hide content. Clear removes the selected bars' content and marks while retaining their IDs, positions and all unselected bars. Clear/close/reopen follow the existing permission and current-preview guards, active draft and undo paths. The scoped contract and evidence are recorded in `.impeccable/surfaces/src-components-preview-edit-previewbareditor-tsx.md`.

The bar context menu starts with Clear, then Close empty cells or Reopen when all selected cells are closed. Short descriptions distinguish removing content from hiding an empty cell; a disabled Close keeps the readable reason to clear first. Preserve the existing copy, overwrite/before/after paste and ending actions below these choices. The local menu is (280px) wide, clamps to (8px) viewport margins, limits its height to the remaining viewport and scrolls internally. Its local layer (5300) places it above the notation keyboard. Arrow Up/Down cycle enabled actions, Home/End reach the first/last, and Escape dismisses. These menu dimensions and layering remain scoped component behavior, not new global tokens.

## Do's and Don'ts

### Do:

- **Do** use the semantic surface, border and text roles together in light and dark UI.
- **Do** preserve the existing UI font and the green mapping behind indigo utilities.
- **Do** use 44–48px primary mobile touch controls; padded segmented rails contain 40px options.
- **Do** keep modal content independently scrollable, retain visible completion controls and respect safe-area insets.
- **Do** retain visible focus, keyboard navigation and meaningful labels.
- **Do** preserve native form-control color schemes alongside the root theme and respect explicit theme choices.
- **Do** keep notation key height floors and allow the center of a short phone dock to scroll.
- **Do** preserve dedicated switch thumb and track colors when changing theme compatibility rules.
- **Do** keep voice selection and per-bar naming inside the same notation workflow, with chart selection feedback.
- **Do** distinguish shared bar text from the name and notation of an individual voice.
- **Do** keep timed lower notation close to its chord/pass stack and reserve real space for additional voices.
- **Do** preserve untimed and unmetered rendering when applying compact chart geometry.
- **Do** render the same saved setlist arrangement in selected previews, unselected previews and export.
- **Do** keep sheet drag, native content scrolling and field/tab interactions distinct.
- **Do** preserve the pinch focal point and keep the zoom label consistent through release or cancellation.
- **Do** use flat divided mobile song/project rows with readable titles and aligned musical controls.
- **Do** retain explicit three-line handwriting space while capping timed chord-only rows.
- **Do** anchor popover motion to the trigger while measuring an untransformed shell.
- **Do** make exiting surfaces inert immediately and keep action commits and keyboard interactions instant.
- **Do** apply live reduced-motion preferences with zero transform duration and the scoped opacity fallback.
- **Do** retain stable notification identity when pending feedback becomes success or error.

### Don't:

- **Don't** promote the mobile song editor's three-tab composition into a requirement for every screen.
- **Don't** substitute raw white and gray styling for theme-aware roles in new mobile editing surfaces.
- **Don't** use muted or faint text roles interchangeably: labels and placeholder text in the mobile editor use the muted role.
- **Don't** change chart or notation typography to match UI controls; export keeps its printable light appearance.
- **Don't** let generic dark compatibility override dedicated component variants or printable chart content.
- **Don't** reserve empty filler below notation keys; use content-sized panels with bounded center scrolling.
- **Don't** distribute spare A4 height inside timed notation-bearing rows or inflate ordinary single-melody pagination.
- **Don't** let a pinch change the current setlist item or trigger a synthetic editor click.
- **Don't** expose destructive song actions as a competing row-level icon; use the labelled anchored overflow.
- **Don't** allow scroll exhaustion to move the app frame or carry preview pan offsets into PDF output.
- **Don't** animate core editor geometry, rapid song choice, score reading or notation input as part of occasional-surface motion.
- **Don't** animate mobile sidebar width or add a transformed ancestor around its fixed notation keyboard.
- **Don't** add list staggers, decorative reveals or new positional hover motion to this interaction system.

Source: `src/lib/uiMotion.ts`, `src/components/ui/InteractionMotion.tsx`, `src/hooks/useUiMotion.ts`, `src/hooks/useReducedMotionPreference.ts`, `src/components/useAnchoredPortalPanel.ts`, `src/components/Toast.tsx`, `src/components/KeyPicker.tsx`, `src/components/CapoPicker.tsx`, `src/components/SongEditor.tsx` (floating selection toolbar only), `src/hooks/usePreviewPinchZoom.ts`, `src/lib/previewZoom.ts`, `src/hooks/useBottomSheetMotion.ts`, `src/hooks/useAppViewport.ts`, `src/hooks/useModalFocus.ts`, `src/components/SetlistSongActions.tsx`, `src/components/MobileSidebarNavigation.tsx`, `src/components/ChordSheet.tsx`, `src/index.css`, `src/components/SongMetadataPanel.tsx`, `src/components/SongMetadataPanel.css`, `src/components/PreviewWysiwygEditor.tsx`, `src/components/SetlistCompactControls.tsx`, `src/lib/previewEditorLayout.ts`, `src/components/preview-edit/PreviewBarEditor.tsx`, `src/components/preview-edit/NotationVoiceSelector.tsx`, `src/lib/notationVoiceEditing.ts`, `src/components/JianpuVoiceStack.tsx`, `src/components/RhythmVoiceStack.tsx`, `src/components/PickupPreview.tsx`, `src/styles/dark-ui.css`, `src/hooks/useThemeMode.ts` and `src/App.tsx`.

Evidence: `.impeccable/review/mobile.png`, `mobile-chart.png`, `mobile-audio.png`, `mobile-dark-details.png`, `mobile-dark.png`, `phone-small.png`, `desktop.png` and `interaction-verification.json` cover metadata layouts, independent scrolling, preserved chart coordinates and focus behavior. `keyboard-theme-verification.json`, `keyboard-normal-verification.json`, `keyboard-viewport-verification.json` and `switch-theme-verification.json` cover theme, key geometry, bounded scrolling and distinct switch states; the current content-sized keyboard supersedes the earlier fixed-dock snapshots.

Voice evidence: `.impeccable/review/voices-{320,390,768,1440}-{chords,rhythm,jianpu,rename,text,dark}.png`, `voices-short-rename.png` and `voices-verification.json` cover phone through desktop, dark appearance, short-viewport renaming, preserved neighboring notation and shared-text round trips. Chart evidence: `chart-spacing-{320,390,768,1440}-{1,2,3}.png`, `chart-spacing-{390,1440}-solo.png`, `chart-spacing-390-dark.png` and `chart-spacing-{390,1440}-{subdivided,unmetered,untimed}.png` cover row modes, ordinary melody capacity and special notation rendering. Independent review returned ship for the scoped voice work and both material chart-spacing corrections. The verified setlist switch sequence retains the same arrangement page counts across selection changes.

Interaction evidence: `pinch-matrix-final-verification.json`, `pinch-webkit-final-verification.json` and `pinch-cancel-verification.json` record browser-emulated focal release drift below (0.3 CSS px) in Chrome at 320/390/768/1024 widths and below (1 CSS px) for synthetic WebKit touches, plus restored zoom labels on cancellation. These measurements do not establish physical-device frame rates. Sheet behavior is recorded in `sheet-verify-verification.json`, `sheet-webkit-verification.json`, `sheet-focus-verification.json` and `secondary-sheet-verification.json`. Sidebar evidence includes `sidebar-verify-final-verification.json`, `sidebar-webkit-final-verification.json`, `sidebar-touch-verification.json`, `sidebar-{320,390,1280}.png`, `sidebar-dark-{320,390}.png`, `sidebar-menu-{320,390}.png`, `projects-{320,390,1280}.png` and `projects-dark-{320,390}.png`. Independent scoped reviews returned ship for anchored zoom, detail sheets/row caps and sidebar/project refinements.

Motion evidence: `.impeccable/review/motion-{harness,harness-webkit,app-verify,app-verify-webkit,slow,verdict,verdict-webkit}-verification.json` covers Chrome/WebKit, phone/desktop, dark and live reduced preferences, stable anchored geometry at slowed playback, immediate action commits and inert exits. Independent scoped review returned ship for live preference retargeting, guarded exits and the shared interaction profiles. Temporary fixture styling is not part of this system.

Latest verification: 114 test files and 1,090 tests passed; lint and production build passed. Changes remain local and unpublished; UI work did not modify production NAS songs. Review screenshots are evidence, and no shipping raster assets were created. These scoped reviews do not certify every incumbent surface in the app.

Not canonized: tiny incumbent labels, local notation glyph sizes, uppercase eyebrow treatments and incidental colored/raised key shadows remain local implementation details. The supported legacy neutral utilities now have semantic dark compatibility; this pass does not claim that every hardcoded color in the app is covered. No incidental decoration or remaining advisory is promoted into a new global rule.

Team setlist score comparison offers an explicit save-as choice beside source reconciliation. Save As names and inserts a new song from the reviewed edited snapshot, preserving the original source, the setlist association and its performance settings. Require a non-empty name, keep the new identity stable on a refresh/retry and reject any existing identity on the create-only persistence path. Dialogs remain bounded to the visual viewport and scroll internally on phones.

Setlist display mode is a personal account/browser preference for every setlist role. Keep shared setlist display_mode as a legacy default; reading controls never persist a shared setlist mutation. Preview, performance and PDF export consume the effective personal mode. In an active score draft, only keyboard input mode follows a reading-mode change; do not write personal display flags into score data. The team-library live-status row exists only when it has content: setlist pages with no pending update do not reserve a blank 48px band above the toolbar. System safe-area padding remains intact.

Preview startup measures the scroll viewport and sheet bounds before the first visible paint, so the chart starts at its fitted scale and centered position. Returning from About or Help reattaches both measurement observers to the remounted preview. Resize callbacks remain coalesced per animation frame and are cancelled when the pane detaches; pinch-zoom anchoring keeps its existing path.

Native preview pinch listeners are enabled only while the sheet view is mounted. About and Help release the old pane listeners; returning binds the new pane even when the selected song or setlist identity is unchanged.

Chart music and closed-filler rows have no Motion layout projection or CSS geometry transitions. Fitting, font measurement and pane changes must not animate chords or barlines inside stationary paper. Selection/highlight color feedback remains independent. Verify startup by tracking bar coordinates relative to the paper through font readiness, using the real bootstrap and multi-page songs; outer paper stability alone is insufficient.

Project/setlist navigation remembers a device-local location separately for each account and library. Restore it only after the authoritative workspace has loaded, before presenting its navigation panel; do not overwrite it from an empty pre-auth cache or while switching libraries. Remember project overview versus meeting detail and the selected song. An archived or removed meeting returns to its active parent project with no substitute meeting selected; an archived, removed or inaccessible project returns to the setlist root containing project folders and loose setlists. Open the navigation panel at overview fallbacks so the choices are visible. Explicit accessible setlist links take priority over memory.

Opening a meeting acknowledges input before expensive chart work: show a named loading status, yield a paint, then schedule the content change as a React transition. The named loading status appears over the right-hand score preview. The navigation panel uses a 240ms hierarchy push with UI_DRAWER_EASE: the next level enters from the right as its parent moves left by 25%; returning reverses the path. Outgoing panels are inert. Reduced motion uses a 125ms opacity transition and keyboard navigation stays instant. No chart transform or row geometry is animated. Newer requests and library/workspace changes cancel queued navigation; automatic restoration does not animate the navigation panels.

Swipe actions on meeting, project and participant rows use a shared isolated row component. Pointer movement writes only the dragged foreground's full translate3d transform, coalesced per frame; it must not set App state for every pixel. The foreground has an opaque semantic surface beneath selection tints. Hide both action layers at rest and paint only the direction being revealed, keeping hidden actions inert and out of the accessibility tree. One navigator row may be open at a time. Vertical scrolling and pinch remain native; pointer cancellation, outside interaction, Escape, context changes and unmount release pending work. Release snaps use the shared UI_EASE_OUT curve for 160ms; keyboard and reduced-motion snaps are immediate while direct manipulation continues to track the pointer. Participants expose only the remove side; they cannot pull out an empty archive side. Preserve existing permissions, long-press multi-selection and confirmation before removal/deletion.

The team song library follows the same quiet header rule as setlists: ordinary automatic sync never reserves a status row above the toolbar. Keep sync confirmation in the existing sidebar status icon and its feedback. Render a content-sized live-status row only for a pending library version, failed cloud refresh, unavailable editing presence or another editor on the current song; preserve Save & load and existing edit-safety guards. Switching between healthy song-library and setlist views must keep the toolbar at the same vertical position.

Combined author/version inputs preserve their original lyricist/composer fields when text is unchanged or restored. Confirming untouched author or translator text must not migrate credit fields or change capitalization; real edits still participate in source-version comparison.

Each owned project folder exposes its named members-and-permissions entry. Keep that read scoped to the selected/inspected project, and discard late results after its identity changes. Project management concentrates members and inline role controls while preserving existing authorization and removal confirmations; project setlists remain in the parent folder. Load only the inspected project, not every project's membership. Native touch listeners track tablet swipes independently of mouse Pointer Events; a non-passive touchmove listener prevents scrolling only after horizontal lock, and multi-touch/vertical movement remain native.

Source reconciliation compares the current library and current setlist in fixed, named columns, with actual changed values and specific added/removed measures. Identity-only arrangement changes remain in version history rather than appearing as false musical changes; persistence snapshots and concurrency guards retain exact identities. Conflicts have no preselected update direction. Selecting a direction marks the adopted and affected columns, names the source and destination, and keeps the affected scope beside the explicit confirmation action. Put backup/history detail and save-as behind disclosures. Keep the heading and action footer visible while the comparison body scrolls, including on narrow or short viewports; retain vh fallbacks for older tablet browsers.

Continuous setlist reading selects the song with the largest visible vertical extent, rather than a fixed activation line near the viewport top; ties retain the current song. Explicit smooth jumps keep their selection while traversing other songs, but a fresh touch, wheel or pointer press cancels the jump immediately. No-event scroll requests must release their lock. A new intentional pan also ends zoom selection grace. Keep source-version notices in a compact floating action inside the preview, outside both document flow and the scaled canvas, so appearing/disappearing notices never change preview bounds or fit scale. Modern browsers use native overscroll containment; the legacy tablet fallback locks a gesture axis after deliberate movement and never reclassifies small drift as another axis.
