# 團隊邀請正式環境修復（2026-09-12）

正式專案 `vfkpgcrfdwjndgqzatao` 的 migration ledger 停在 `20260801100000`，未包含 `20260829132248_team_invite_inbox.sql`。前端邀請頁已呼叫 `get_my_team_invites()`，因此回傳 PGRST202。

已透過 Supabase MCP 部署前向修復 `20260912042942_restore_team_invite_inbox.sql`，補上邀請收件匣、接受／拒絕 RPC 與通知類型，明確撤銷這五個 RPC 的匿名執行權限，並通知 PostgREST 重載 schema。新修復檔版本與 MCP 實際記錄一致；原始歷史 migration 保留。

驗證：

- `supabase/tests/team_invite_inbox.sql` 的 SQL 測試在單一交易執行後 rollback；僅將 psql 變數改成交易內設定，以供 MCP 執行。
- 重複邀請留下單一有效邀請／通知；其他帳號無法查看或接受；受邀帳號可查看並接受，取得指定角色，通知同步清除。
- 三個收件人 RPC 均允許 authenticated、禁止 anon；測試帳號及團隊已確認沒有保留。
- 已執行 security advisors。本次變更以外的既有提醒未納入此修復。

既有邀請 token 不變，不需重新建立連結。此次未部署前端，也未整批推送其他待部署 migration。未來推送前仍需核對歷史 ledger 的既有差異；不要直接假定所有本機 migration 都已上線。
