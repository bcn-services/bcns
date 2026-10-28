import { GOAL, type RailStats } from "./TodayBrandonStats";

/** Progress ring: `done` of `goal`, the arc stops at a full circle. */
function Ring({ done, goal }: { done: number; goal: number }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, done / goal);
  return (
    <svg className="rg" viewBox="0 0 150 150" role="img" aria-label={`${done} of ${goal} calls`}>
      <circle cx="75" cy="75" r={r} fill="none" stroke="var(--line)" strokeWidth="12" />
      <circle
        cx="75"
        cy="75"
        r={r}
        fill="none"
        stroke={done >= goal ? "var(--ok)" : "var(--accent)"}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${frac * c} ${c}`}
        transform="rotate(-90 75 75)"
      />
      <text x="75" y="80" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--ink)">
        {done}
      </text>
      <text x="75" y="102" textAnchor="middle" fontSize="12" fill="var(--mute)">
        of {goal} calls
      </text>
    </svg>
  );
}

/** Mon-Fri column chart with the daily-goal line; today's bar is the accent one. */
function WeekChart({ week, goal }: { week: RailStats["week"]; goal: number }) {
  const W = 260;
  const H = 110;
  const top = 8;
  const base = H - 4;
  const max = Math.max(goal, ...week.vals) * 1.1;
  const y = (v: number) => base - ((base - top) * v) / max;
  const bw = 30;
  const step = W / week.vals.length;
  return (
    <svg className="wc" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Calls this week">
      <line x1="0" x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--mute)" strokeDasharray="4 4" />
      {week.vals.map((v, i) => {
        const x = i * step + (step - bw) / 2;
        return (
          <g key={week.labels[i]}>
            <rect
              x={x}
              y={y(v)}
              width={bw}
              height={Math.max(2, base - y(v))}
              rx="4"
              fill={i === week.hi ? "var(--accent)" : "var(--tint2)"}
            />
            <text x={x + bw / 2} y={H + 13} textAnchor="middle" fontSize="12" fill="var(--mute)">
              {week.labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Brandon's narrow progress rail: today vs goals, best day, streak, calendar, week chart, recent wins. */
export function TodayBrandonRail({ s, calendar }: { s: RailStats; calendar: React.ReactNode }) {
  return (
    <aside className="tb-rail" aria-label="Your progress">
      <h2>Today</h2>
      <Ring done={s.today.calls} goal={GOAL.calls} />
      <div className="rs">
        <span>
          <b>{s.today.reached}</b>/{GOAL.reached} reached
        </span>
        <span>
          <b>{s.today.consults}</b>/{GOAL.consults} consult
        </span>
      </div>
      <p className="rbest">
        {s.best === 0 ? (
          "Best day: no history yet"
        ) : s.beaten ? (
          <>
            Best day: {s.best} calls · <b>beaten!</b>
          </>
        ) : (
          <>
            Best day: {s.best} calls · <b>{s.toBeat}</b> to beat it
          </>
        )}
      </p>
      <h3>
        Streak · {s.streak} day{s.streak === 1 ? "" : "s"}
      </h3>
      <div className="streak" aria-label={`${s.streak} day streak`}>
        {s.days.map((d, i) => (
          <i key={i} className={`${d.hit ? "on" : ""}${d.today ? " today" : ""}`}>
            {d.label}
          </i>
        ))}
      </div>
      {calendar}
      <h3>This week</h3>
      <WeekChart week={s.week} goal={GOAL.calls} />
      <h3>Recent wins</h3>
      {s.wins.length ? (
        <ul className="wins">
          {s.wins.map((w, i) => (
            <li key={i}>
              <span aria-hidden="true">{w.kind === "consult" ? "✓" : "☎"}</span>
              <span className="wn">
                {w.kind === "consult" ? "Consult booked: " : "Reached "}
                {w.name}
              </span>
              <span className="wt">{w.time}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No wins yet. The first reach shows up here.</p>
      )}
    </aside>
  );
}
