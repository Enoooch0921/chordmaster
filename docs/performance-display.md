# 演出模式顯示

進入演出模式的點擊會同步嘗試呼叫瀏覽器 Fullscreen API。支援標準與 WebKit 前綴；失敗仍顯示演出模式，工具列提供重新全螢幕的按鈕。退出時只結束此演出模式啟動的全螢幕，不影響先前已進入的全螢幕。

至少 1000px 寬、寬高比至少 1.25、且歌曲超過一頁時，桌面與平板自動並排兩張 A4。手機、直向平板、小視窗及單頁歌曲維持單頁。雙頁一次前後翻兩頁；奇數末頁不補造內容，回到前一首歌時落在最後一組頁面。切換方向會保留目前可見頁所在的組別。

排版依演出容器實際高度及安全區域縮放，跟隨全螢幕、旋轉與動態瀏覽器工具列變更。樂譜與歌詞共用原本的分頁 DOM，不複製整份歌曲。

Mac、支援的 iPadOS Safari 與 Android 瀏覽器可在使用者點擊時進入全螢幕。iPhone Safari 尚不支援一般網頁元素全螢幕，因此無法由演出模式按鈕強制移除 Safari 工具列。可透過 Safari 分享選單「加入主畫面」，保留「以 Web App 開啟」，再從主畫面圖示開啟，移除網址列。網站已具備 standalone manifest 與 Apple web app 設定。系統狀態列／手勢區域仍由作業系統管理。

「更多」選單提供「加入主畫面」入口，iPhone／iPad 使用者可切換裝置查看三步圖解與 Apple 官方說明。無 Fullscreen API 的 Apple 行動瀏覽器提供「無網址列使用方式」按鈕，開啟同一份圖解。原生 modal dialog 保持在演出畫面上方，直到使用者關閉；說明開啟時暫停演出鍵盤輸入的焦點恢復，關閉後繼續翻頁。

從主畫面啟動或在引導中點「我已加入，不再顯示」後，隱藏加入入口與安裝提示；支援全螢幕的按鈕仍可使用。「稍後再說」僅關閉引導，不視為已安裝。Safari 沒有跨分頁／主畫面 App 的可靠安裝查詢，獨立 App 與 Safari 也可能使用不同儲存空間，因此 Safari 分頁仍提供手動確認。此偏好只存在目前瀏覽器，不寫入曲庫或 NAS。

資料來源：[MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)、[WebKit Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)、[iPhone Fullscreen API 追蹤](https://bugs.webkit.org/show_bug.cgi?id=206854)、[Apple 加入主畫面說明](https://support.apple.com/zh-tw/guide/iphone/iphea86e5236/ios)。實機 Safari 的全螢幕及主畫面啟動行為須另行實機驗證。
