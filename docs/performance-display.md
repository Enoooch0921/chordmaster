# 演出模式顯示

進入演出模式的點擊會同步嘗試呼叫瀏覽器 Fullscreen API。支援標準與 WebKit 前綴；失敗仍顯示演出模式，工具列提供重新全螢幕的按鈕。退出時只結束此演出模式啟動的全螢幕，不影響先前已進入的全螢幕。

至少 1000px 寬、寬高比至少 1.25、且歌曲超過一頁時，桌面與平板自動並排兩張 A4。手機、直向平板、小視窗及單頁歌曲維持單頁。雙頁一次前後翻兩頁；奇數末頁不補造內容，回到前一首歌時落在最後一組頁面。切換方向會保留目前可見頁所在的組別。

排版依演出容器實際高度及安全區域縮放，跟隨全螢幕、旋轉與動態瀏覽器工具列變更。樂譜與歌詞共用原本的分頁 DOM，不複製整份歌曲。

Mac、支援的 iPadOS Safari 與 Android 瀏覽器可在使用者點擊時進入全螢幕。iPhone 瀏覽器的支援較受限；可透過 Safari 分享選單「加入主畫面」，再從圖示開啟，移除網址列。網站已具備 standalone manifest 與 Apple web app 設定。系統狀態列／手勢區域仍由作業系統管理。

資料來源：[MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)、[WebKit Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)。實機 Safari 的全螢幕及主畫面啟動行為須另行實機驗證。
