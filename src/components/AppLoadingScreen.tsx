/** Keep this markup in sync with the pre-React loading screen in index.html. */
export default function AppLoadingScreen({
  message = '正在載入歌譜…', error, onRetry, retryLabel = '重試'
}: { message?: string; error?: string | null; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className={`app-loading${error ? ' app-loading--error' : ''}`} role="status" aria-live="polite" aria-label={message}>
      <div className="app-loading__content" aria-hidden="true">
        <img className="app-loading__logo" src={`${import.meta.env.BASE_URL}logo.svg`} width="80" height="80" alt="" />
        <div className="app-loading__name">ChordMaster</div>
        <div className="app-loading__message">{message}</div>
      </div>
      {error && <div className="app-loading__recovery">
        <p>{error}</p>
        {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
      </div>}
    </div>
  );
}
