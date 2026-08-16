/** Shown for any URL that is not a real page — most often a mistyped room link. */
export default function NotFound() {
  return (
    <div className="center">
      <div className="panel stack" style={{ width: 380, textAlign: "center" }}>
        <h2>Nothing here</h2>
        <p className="muted">
          That link does not point at anything. If you were given a room code, enter it on the start
          screen.
        </p>
        <a className="hw-btn hw-btn--primary" href="/">
          Back to the start
        </a>
      </div>
    </div>
  );
}
