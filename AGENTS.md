# Current ChordMaster production backend

- Since 2026-09-21, production data lives on the church NAS, running self-hosted Supabase at `https://supabase.living-water.familyds.com`.
- Do not use the Supabase Cloud connector/project `vfkpgcrfdwjndgqzatao` for ongoing score reads or writes. That project is retained as a historical copy, and its quota should not be consumed by transcription work.
- Existing transcription scripts and reports through batch254 refer to the old cloud backend. Do not execute their SQL against the Cloud connector.
- For score work, use the NAS access helper `tmp/topchurch-conversion/nas-score-access.py`. It loads credentials from the private migration configuration without printing them. Never copy secrets into the repository, browser fixtures, reports, or frontend.
- Back up the current NAS rows, compare complete song JSON, and guard each write by song ID, TopChurchWorship library ID, active status and unchanged `updated_at`. Re-read the full JSON after writing. Preserve concurrent edits and never replace an entire library.
- Batch255 was initially written to the old Cloud by mistake, then checked against NAS and repaired there. The authoritative NAS verification is `tmp/topchurch-conversion/delivery/batch255-nas-repair-verification.json`.
- Continue following `docs/topchurchworship-transcription-rules.md` for transcription scope and source fidelity.
- For all subsequent score reviews, follow that document's annotation and efficiency rules: score annotations contain only useful performance instructions and specific `待檢查：` questions. Keep process narration in audit files, and do not re-review deferred songs without new evidence.
