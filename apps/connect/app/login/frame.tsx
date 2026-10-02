/** The shared sign-in frame: tinted page, one card with the wordmark, a link back to the marketing site. */
export function Frame({ title, description, children }: { title: React.ReactNode; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="lg">
      <div className="lcard-wrap">
        <div className="lcard">
          <div className="wm">
            <span className="wm-mark" aria-hidden="true" />
            <span>
              bcns <b>Connect</b>
            </span>
          </div>
          <span className="flow" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <h1>{title}</h1>
          <div className="d">{description}</div>
          {children}
        </div>
        <p className="back">
          <a href="https://bcn-services.com">Back to bcn-services.com</a>
        </p>
      </div>
    </div>
  );
}
