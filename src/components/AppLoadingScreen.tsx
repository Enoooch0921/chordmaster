/** Keep this markup in sync with the pre-React loading screen in index.html. */
export default function AppLoadingScreen() {
  return (
    <div className="app-loading" role="status" aria-live="polite" aria-label="正在載入歌譜…">
      <div className="app-loading__content" aria-hidden="true">
        <img className="app-loading__logo" src={`${import.meta.env.BASE_URL}logo.svg`} width="80" height="80" alt="" />
        <div className="app-loading__name">ChordMaster</div>
        <div className="app-loading__message">正在載入歌譜…</div>
      </div>
    </div>
  );
}
