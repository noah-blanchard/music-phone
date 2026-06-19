/**
 * Shown only under the small-screen breakpoint (see .notice in globals.css).
 * MusicPhone's full-screen piano roll is designed for larger screens; rather
 * than cram it onto a phone, we ask players to switch devices.
 */
export function SmallScreenNotice() {
  return (
    <div className="notice">
      <div className="panel stack" style={{ padding: 28, maxWidth: 360 }}>
        <div className="logo" style={{ fontSize: 28 }}>
          Music<span className="accent">Phone</span>
        </div>
        <p className="muted">
          The studio needs room to breathe. Open MusicPhone on a tablet or computer to play.
        </p>
      </div>
    </div>
  );
}
