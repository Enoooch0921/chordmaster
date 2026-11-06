---
version: 1
slug: "chart-song-map"
primary_target: "src/components/ChartSongMap.tsx"
related_targets: ["src/components/SongMapToken.tsx", "src/index.css", "src/components/SongMapToken.test.tsx"]
---

# Readable numbered song-map cues — 2026-11-06

Mode: Read. The user specifically identified the song-map tokens beneath the title, rather than section labels within the chart. Preserve the current chart fonts, section colors, exact labels and the existing 34px/42px map heights.

Simple cues keep their circles. Numbered cues with multiple passes or longer section codes (V1&2, V1/2, Pc1&2) use wider rounded rectangles with a single-line code and exact number suffix. Reserve natural width before fitting, share the maximum width of paired dense-row columns and reserve 10px for external repeat counts. Separate ×2 from the section numbers. Preserve full accessible names and existing custom labels. Do not stack tiny text inside a circle; that first iteration was rejected after visual review.

The map retains its existing local typography exception: normal title-row labels 12px, dense labels 10px, numbered suffix 0.92em and external repeat count 8px. These are compact notation cues, not general controls or a new global UI scale. Scope changes to common numbered cues; custom free-text labels retain their previous behavior.

Actual App and normal/dense synthetic captures are in `output/playwright/interaction-feedback-20261106/`. Independent visual review approved the wider single-line version; a follow-up reserved repeat space to resolve its minor crowding note. This is a local implementation, not a production deployment or physical-device readability measurement.
