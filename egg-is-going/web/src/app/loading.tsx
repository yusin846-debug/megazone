export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="route-loading__rail" aria-hidden="true" />
      <aside className="route-loading__side" aria-hidden="true">
        <span className="eg-wordmark" style={{ fontSize: 19 }}>egg is going<i /></span>
        <div className="skeleton" style={{ height: 54, marginTop: 40 }} />
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 28, marginTop: 20 }} />)}
      </aside>
      <main className="route-loading__main">
        <p className="route-loading__label"><span className="feedback-spinner" aria-hidden="true" />화면을 불러오고 있어요</p>
        <div className="skeleton" style={{ width: "38%", height: 32, marginBottom: 18 }} />
        <div className="skeleton" style={{ width: "62%", height: 16, marginBottom: 36 }} />
        <div className="route-loading__cards">{[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}</div>
        <div className="skeleton" style={{ height: 240, marginTop: 28 }} />
      </main>
    </div>
  );
}
