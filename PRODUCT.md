# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ChordMaster serves worship teams preparing and reading chord, rhythm and jianpu charts. The user confirmed on 2026-10-26 that mobile chart reading and full song editing are equally important.

## Product Purpose

Keep song charts, musical metadata and service setlists together, with immediate chart preview and transposition.

## Operating Context

Rehearsal, service preparation and live chart reading. Mobile users need both quick musical adjustments and access to complete editing controls. The web UI also runs in an iOS Capacitor wrapper.

## Capabilities and Constraints

Preserve the existing songs, setlists, shared libraries, metadata and permissions. Production uses the church NAS Supabase endpoint documented in AGENTS.md. UI work must not modify score data. Google sign-in must allow account selection. An open mobile editor must scroll independently and preserve the background chart position.

## Evidence on Hand

README.md, src/types.ts, src/components/SongMetadataPanel.tsx, src/components/PreviewWysiwygEditor.tsx, src/index.css and public/logo/ contain the existing product, controls and visual assets. Real song data must not be invented or rewritten for design demonstrations.

## Product Principles

- Mobile reading and editing are equally important.
- Keep musical settings easy to reach while preserving complete editing capability.
- Preserve chart position and active work across UI interactions.
- Keep account choice explicit at sign-in.
