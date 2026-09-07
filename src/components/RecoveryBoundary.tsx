import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadRecoveryData, getRecoverySnapshot } from '../lib/recovery';

export default class RecoveryBoundary extends Component<{
  children: ReactNode; label?: string;
}, { failed: boolean; downloadFailed: boolean; recoveryData: unknown }> {
  state = { failed: false, downloadFailed: false, recoveryData: null as unknown };

  static getDerivedStateFromError() { return { failed: true, recoveryData: getRecoverySnapshot() }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ChordMaster view failed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="m-4 rounded-2xl border border-amber-200 bg-white p-6 text-gray-900 shadow-sm">
        <h2 className="text-lg font-bold">{this.props.label ?? '畫面'}暫時無法顯示</h2>
        <p className="mt-2 text-sm">請先下載目前的資料備份，再重試或重新載入頁面。</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {this.state.recoveryData != null && (
            <button type="button" className="rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={async () => {
              try { await downloadRecoveryData(this.state.recoveryData); }
              catch { this.setState({ downloadFailed: true }); }
            }}>下載資料備份</button>
          )}
          <button type="button" className="rounded-lg border px-4 py-2" onClick={() => this.setState({ failed: false })}>重試</button>
          <button type="button" className="rounded-lg border px-4 py-2" onClick={() => window.location.reload()}>重新載入頁面</button>
        </div>
        {this.state.downloadFailed && <p className="mt-3 text-sm text-red-700">備份下載失敗，請先保留此頁面並重試。</p>}
      </section>
    );
  }
}
