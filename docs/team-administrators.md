# 團隊總管理員與共享歌單權限

`admin` 是團隊總管理員，不會變更 `libraries.owner_user_id`。團隊仍只有一位 `owner`。

| 角色 | 歌曲譜面 | 歌單／專案 | 成員 |
| --- | --- | --- | --- |
| 擁有者 `owner` | 全部 | 全部 | 可指派或移除總管理員及其他成員 |
| 總管理員 `admin` | 全部 | 全部，包含別人建立的項目與編輯指派 | 可邀請、調整或移除較低角色，不能操作擁有者、其他總管理員或自己的角色 |
| 歌曲管理員 `editor` | 可編輯團隊歌曲 | 自己建立的專案；自己建立或獲指派的歌單 | 無 |
| 歌單管理員 `setlist_manager` | 不可修改歌曲或歌單內譜面／段落順序 | 自己建立的專案；自己建立或獲指派的歌單，可選歌、排序、調整共享 Key | 無 |
| 檢視者 `viewer` | 檢視 | 檢視，不能修改共享 Key | 無 |

Capo 是每位登入使用者自己的設定。外部分享專案的 `manager` 是另一個既有角色，不等同於團隊總管理員。

## 資料庫實作

新增 migration：`supabase/migrations/20261026072122_team_administrators.sql`。

- 擴充團隊 `library_members.role`，保留擁有者不可變及單一擁有者的限制。
- `is_library_owner` 維持嚴格擁有者判斷；`can_manage_library_members` 另接受團隊總管理員。
- 歌曲、歌單、專案與指派權限共用既有 RLS helper，總管理員不受建立者或歌單指派限制。
- 調整成員的 RPC 會鎖定工作區及目標成員，驗證操作者、目標角色及新角色。
- 移除早期的邀請資料表直接寫入入口，邀請一律走受檢查的 RPC。未明確傳入角色時預設 `viewer`，邀請不直接授予 `admin`。
- 舊邀請接受時不覆寫既有成員角色，避免將已升級的管理員降級。
- 新增及替換的函式明確撤銷 `PUBLIC`、`anon` 權限，必要 RPC 才授予 `authenticated` 執行權限；新的 trigger 函式不能直接呼叫。

歌單管理員寫入 `setlist_songs` 時，伺服器保留既有 `override_json` 的譜面、段落順序及其他內容，只接受新的 `overrideKey` 與歌曲排列位置。這採用保留伺服器原值的方式，因為前端正規化舊譜面後會傳回與資料庫 JSON 不完全一致的內容；不會把這種差異當成譜面更新。

前端在儲存前檢查整份待儲存工作區，並將當時的角色以暫時欄位 `expectedTeamRole` 隨每筆歌單歌曲送出。如果伺服器認定使用者為歌單管理員，但欄位缺少或仍是 editor／admin，會明確拒絕儲存，讓前端保留本機草稿。這也讓舊版管理員介面在重整前收到錯誤，避免把忽略的譜面修改誤認為已儲存。欄位不會保留在資料庫；既有項目的 UPSERT 會先鎖定原項目，再由 UPDATE trigger 消耗標記。

共享專案的 `set_project_setlist_song_key` 與 `reorder_project_setlist` RPC 仍檢查既有專案管理員權限。它們只接受 Key／歌曲順序，由伺服器補上相同標記，不擴大可修改的內容。

新加入的歌曲使用同一團隊曲庫的有效歌曲內容建立快照與預設段落順序。複製已有歌單時，前端傳入 `copySourceId`，repository 將它轉成暫時的 `sourceSetlistSongId`；伺服器驗證來源屬於同一曲庫、同一歌曲，再複製已儲存的譜面與段落順序，並移除標記。來源尚未儲存時，前端必須等待儲存完成或使用已儲存的原始來源。既有複本之後即使原來源刪除仍可正常保存。

migration 本身不授予任何指定帳號權限。套用 schema 後再執行經使用者授權、具有原角色條件的單筆角色變更；不可將擁有權轉移當作總管理員授權。

## 隔離驗證

不需連接 NAS 或 Supabase Cloud。將測試 runtime 安裝到暫存目錄：

```sh
npm install --prefix /tmp/chordmaster-sql-validation --no-audit --no-fund @electric-sql/pglite@0.5.11
node supabase/tests/run-permission-tests.mjs /tmp/chordmaster-sql-validation/node_modules/@electric-sql/pglite
```

runner 使用暫存 PostgreSQL、`pgcrypto`、最小 Supabase 身分介面，以及真實資料庫角色、RLS、trigger 與函式權限。它依歷史依賴順序套用全部 migration；三份 SQL 測試都以交易回滾 fixture。

本次驗證：25 份 migration 成功；`team_administrators.sql` 117 個 SQL statement、`team_library_permissions.sql` 187 個、`team_invite_inbox.sql` 29 個全部成功。既有測試中直接讀取已撤權私有表的斷言改用明確授權的暫存 fixture；邀請測試的 psql 變數改為暫存 fixture，以便同時用 psql 與隔離 runner 執行。

可另行指定測試檔：

```sh
node supabase/tests/run-permission-tests.mjs /tmp/chordmaster-sql-validation/node_modules/@electric-sql/pglite security_definer_acl.sql
```

這份既有廣泛安全測試的最後一項目前仍失敗：舊 migration 只在 `public` schema 層級撤銷未來函式的預設 `PUBLIC EXECUTE`，無法覆蓋 PostgreSQL 全域的函式預設權限。這是原有的未來函式預設問題；本次新增／替換的函式都有明確撤權，測試已驗證。本次沒有改動跨 schema 的全域預設，以免影響其他服務未來的 migration。
