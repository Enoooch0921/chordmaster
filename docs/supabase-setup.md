# Supabase Setup

這份文件對應目前專案已接好的第一階段能力：

- Google OAuth 登入
- Email Magic Link 登入
- 雲端歌曲庫 / 歌單同步
- 首次登入本地資料匯入
- 唯讀分享連結

## 1. 建立 Supabase 專案

1. 到 Supabase 建立一個新 project。
2. 記下：
   - `Project URL`
   - `anon public key`
   - `project ref`

## 2. 設定前端環境變數

在專案根目錄建立 `.env`：

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

如果還沒建立 `.env`，可以直接參考 [.env.example](/Users/zhangenchi/Downloads/chordmaster---智能和弦簡譜編輯器/.env.example)。

## 3. 設定 Auth Providers

到 Supabase Dashboard 的 `Authentication > Providers`：

### Google

1. 啟用 `Google`
2. 在 Google Cloud Console 建立 OAuth client
3. 設定 Authorized redirect URL：

本機：
```text
http://localhost:3000/auth/callback
```

正式站：
```text
https://YOUR_DOMAIN/auth/callback
```

4. 把 Google client id / secret 填回 Supabase

### Email Magic Link

1. 啟用 `Email`
2. 開啟 `Confirm email` / magic link flow
3. 在 `URL Configuration` 裡設定：

Site URL：
```text
http://localhost:3000
```

Additional Redirect URLs：
```text
http://localhost:3000/auth/callback
https://YOUR_DOMAIN/auth/callback
```

## 4. 安裝並連結 Supabase CLI

如果尚未安裝：

```bash
brew install supabase/tap/supabase
```

登入：

```bash
supabase login
```

連結專案：

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

## 5. 推送資料庫 schema

本專案的 migration 在：

- [supabase/migrations/20260415_auth_sync_share.sql](/Users/zhangenchi/Downloads/chordmaster---智能和弦簡譜編輯器/supabase/migrations/20260415_auth_sync_share.sql)

推送：

```bash
supabase db push
```

這會建立：

- `profiles`
- `libraries`
- `library_members`
- `songs`
- `setlists`
- `setlist_songs`
- `share_links`

以及對應的 RLS policies。

## 6. 部署 Edge Functions

本專案目前需要 2 個 function：

- [supabase/functions/create-share-link/index.ts](/Users/zhangenchi/Downloads/chordmaster---智能和弦簡譜編輯器/supabase/functions/create-share-link/index.ts)
- [supabase/functions/resolve-share-link/index.ts](/Users/zhangenchi/Downloads/chordmaster---智能和弦簡譜編輯器/supabase/functions/resolve-share-link/index.ts)

部署：

```bash
supabase functions deploy create-share-link --no-verify-jwt
supabase functions deploy resolve-share-link --no-verify-jwt
```

`resolve-share-link` 需要 `SUPABASE_SERVICE_ROLE_KEY`。通常在 Supabase project secrets 裡設定：

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

如果 `create-share-link` 也需要顯式 secrets，可一併設定：

```bash
supabase secrets set SUPABASE_URL=YOUR_PROJECT_URL
supabase secrets set SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

`create-share-link` 與 `resolve-share-link` 都建議用 `--no-verify-jwt` 部署。這兩個 function 會在程式內自行驗證 Bearer token；如果讓 Edge Gateway 先驗 JWT，當專案使用不被 Gateway 支援的簽章演算法時，請求會在進入 function 前就被擋下來。

## 7. 本機驗證

啟動前端：

```bash
npm run dev
```

驗證流程：

1. 未登入建立歌曲，刷新後仍存在
2. Google 登入成功
3. Email magic link 登入成功
4. 第一次登入時出現本地資料匯入提示
5. 登入後修改歌曲，狀態會從 `Syncing` 回到 `Saved`
6. 斷網後修改資料，狀態顯示 `Offline`
7. 恢復連線後可補同步
8. 建立分享連結後，`/share/:token` 可直接唯讀查看

## 8. 正式部署注意事項

正式環境至少同步更新：

- Supabase `Site URL`
- Supabase `Additional Redirect URLs`
- Google OAuth Authorized redirect URLs
- 前端部署平台的 `VITE_SUPABASE_URL`
- 前端部署平台的 `VITE_SUPABASE_ANON_KEY`

如果正式站路徑不是根目錄，`/auth/callback` 與 `/share/:token` 也要依實際網址調整。

## 9. 常見問題

### 登入後跳回來但還是未登入

優先檢查：

- Supabase redirect URL 是否正確
- Google OAuth redirect URL 是否一致
- 正式站與本機環境變數是否指到同一個 Supabase project

### 分享頁打不開

優先檢查：

- `resolve-share-link` 是否已部署
- `SUPABASE_SERVICE_ROLE_KEY` 是否已設定到 function secrets
- `share_links` 表與 migration 是否已成功推送

### 看得到登入，但同步失敗

優先檢查：

- migration 是否已套用
- RLS policy 是否存在
- `profiles` / `libraries` / `library_members` 是否可建立
