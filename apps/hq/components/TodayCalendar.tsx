import { calTime, type CalResult } from "@/lib/calendar";

const SHOWN = 6;

/** The Calendar section of Today: the next 7 days of meetings this person is invited to, Join Meet where there is one. */
export function TodayCalendar({ cal, now }: { cal: CalResult; now: Date }) {
  const shown = cal.events.slice(0, SHOWN);
  return (
    <section className="sx" aria-label="Calendar">
      <div className="sh">
        <h2>Calendar</h2>
      </div>
      <div className="card">
        {cal.state === "unconfigured" ? (
          <div className="empty">Calendar not connected.</div>
        ) : cal.state === "error" ? (
          <div className="empty">Calendar unavailable right now.</div>
        ) : !shown.length ? (
          <div className="empty">No meetings in the next 7 days.</div>
        ) : (
          shown.map((e) => (
            <div className="row" key={e.id}>
              <span className="rm tcal-t">{calTime(e, now)}</span>
              <span className="rt tcal-n">{e.title}</span>
              {e.meet ? (
                <a className="btn sm" href={e.meet} target="_blank" rel="noopener noreferrer">
                  Join Meet
                </a>
              ) : null}
            </div>
          ))
        )}
        {cal.events.length > SHOWN ? (
          <div className="empty">{cal.events.length - SHOWN} more this week.</div>
        ) : null}
      </div>
    </section>
  );
}
