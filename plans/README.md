# Animation performance fixes

Audited 2026-11-06 at commit 768fefd7. User reported left song-list animation stutter and requested project-wide checks. Plans 001–003 address that audit. The user subsequently requested direct drag feedback and performance swipe feedback/guidance, covered by 004–005. Focused changes from isolated worktrees have been integrated locally.

| Plan | Severity | Status | Dependency |
| --- | --- | --- | --- |
| 001 Sidebar render isolation | HIGH | DONE | baseline profiling first |
| 002 Disclosure layout | HIGH | DONE | independent; verify after 001 |
| 003 Frequent score motion | MEDIUM | DONE | independent; verify together |
| 004 Direct setlist drag | HIGH | DONE | preserve existing reorder/history handlers |
| 005 Performance swipe feedback | HIGH | DONE | preserve immediate page translation |

Static audit confirmed data identity invalidation, animated disclosure height with an observing avoidance loop, and frequent editor/notation animations. Production-build browser measurements and limitations are recorded in `output/playwright/animation-performance-20261106/verification.json`; drag and swipe have separate verification records. These are synthetic local measurements, not physical-device FPS.

Shared popovers, dialogs, bottom sheets and keyboard surface entrances generally already use transform/opacity and honor reduced/keyboard motion. Additional movement is limited to the user's later explicit requests for drag/swipe feedback. These plans were completed locally before release; consolidation and deployment are tracked in [0.12.16 release notes](../docs/release-0.12.16.md).
