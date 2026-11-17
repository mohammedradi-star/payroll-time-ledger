/* Time Doctor payroll ledger — core engine. Pure functions, no DOM.
   All durations are integer seconds. Payroll dates are 'YYYY-MM-DD' strings. */
(function (root) {
  'use strict';
  const DAY_SEC = 86400;
  const LEAVE_DAY_SEC = 28800; // policy: shortfall/idle converted by 8 hours
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const WD = ['sun','mon','tue','wed','thu','fri','sat'];

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function parts(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
  function isValidISO(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const { y, m, d } = parts(s); const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function addDays(s, n) {
    const { y, m, d } = parts(s); const dt = new Date(Date.UTC(y, m - 1, d + n));
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  function weekday(s) { const { y, m, d } = parts(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function dateRange(a, b) { const out = []; for (let s = a; s <= b; s = addDays(s, 1)) out.push(s); return out; }
  function todayIn(tz) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  }

  /* ---------- payroll periods: 21st through the 20th, labelled by ending month ---------- */
  function periodByKey(key) {
    const [y, m] = key.split('-').map(Number);
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return { key, start: iso(py, pm, 21), end: iso(y, m, 20), year: y, month: m };
  }
  function periodKeyFor(date) {
    const { y, m, d } = parts(date);
    if (d <= 20) return `${y}-${pad(m)}`;
    return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  }
  function periodFor(date) { return periodByKey(periodKeyFor(date)); }
  function shiftPeriod(key, n) {
    let [y, m] = key.split('-').map(Number); m += n;
    while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
    return `${y}-${pad(m)}`;
  }

  /* ---------- durations ---------- */
  function parseDuration(raw) {
    if (raw === null || raw === undefined) return { blank: true };
    const s = String(raw).trim();
    if (s === '') return { blank: true };
    let m = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s);
    if (m) return { sec: (+m[1]) * 3600 + (+m[2]) * 60 + (m[3] ? +m[3] : 0) };
    m = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/i.exec(s);
    if (m && (m[1] || m[2] || m[3])) return { sec: (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) };
    if (/^\d+(\.\d+)?$/.test(s)) return { sec: Math.round(parseFloat(s) * 3600) };
    return { error: `"${s}" is not a duration (use 7.5, 7:30 or 07:30:00)` };
  }
  function fmtHM(sec) {
    if (sec === null || sec === undefined || isNaN(sec)) return '—';
    const neg = sec < 0; sec = Math.abs(Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return (neg ? '−' : '') + (h ? `${h}h ${pad(m)}m` : `${m}m`);
  }
  function fmtHMS(sec) {
    if (sec === null || sec === undefined || isNaN(sec)) return '—';
    const neg = sec < 0; sec = Math.abs(Math.round(sec));
    return (neg ? '−' : '') + `${Math.floor(sec / 3600)}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
  }
  const LEAVE_UNITS = [{ frac: 1, sec: 28800, label: 'Full day' }, { frac: 0.5, sec: 14400, label: 'Half day' }, { frac: 0.25, sec: 7200, label: 'Quarter day' }];
  const leaveFrac = day => !day ? 0 : day.kind === 'leave' ? 1 : day.kind === 'partial' ? Math.round((day.leaveSec || 0) / 7200) / 4 : 0;
  const fmtDays = sec => (sec / LEAVE_DAY_SEC).toFixed(2);

  /* ---------- Egypt public holidays (official paid holidays, private sector) ----------
     status 'announced' = date confirmed by cabinet / Ministry of Labour decree.
     status 'expected'  = nominal date; Islamic dates depend on moon sighting and the
     cabinet often moves mid-week holidays to Thursday shortly before. */
  const EG_HOLIDAYS = [
    ['2026-01-07','Coptic Christmas','announced'],
    ['2026-01-29','January 25 Revolution & Police Day (moved from Jan 25)','announced'],
    ['2026-03-20','Eid al-Fitr','expected'],['2026-03-21','Eid al-Fitr holiday','expected'],['2026-03-22','Eid al-Fitr holiday','expected'],
    ['2026-04-13','Sham El-Nessim','expected'],
    ['2026-04-25','Sinai Liberation Day','announced'],
    ['2026-05-01','Labour Day','expected'],
    ['2026-05-26','Arafat Day','expected'],['2026-05-27','Eid al-Adha','expected'],['2026-05-28','Eid al-Adha holiday','expected'],['2026-05-29','Eid al-Adha holiday','expected'],
    ['2026-06-16','Islamic New Year','expected'],
    ['2026-07-02','June 30 Revolution (moved from Jun 30)','announced'],
    ['2026-07-23','July 23 Revolution Day','expected'],
    ['2026-08-27','Prophet\'s Birthday','announced'],
    ['2026-10-08','Armed Forces Day (moved from Oct 6)','announced'],
    ['2027-01-07','Coptic Christmas','expected'],
    ['2027-01-25','January 25 Revolution & Police Day','expected'],
    ['2027-03-09','Eid al-Fitr','expected'],['2027-03-10','Eid al-Fitr holiday','expected'],['2027-03-11','Eid al-Fitr holiday','expected'],
    ['2027-04-25','Sinai Liberation Day','expected'],
    ['2027-05-01','Labour Day','expected'],
    ['2027-05-03','Sham El-Nessim','expected'],
    ['2027-05-15','Arafat Day','expected'],['2027-05-16','Eid al-Adha','expected'],['2027-05-17','Eid al-Adha holiday','expected'],['2027-05-18','Eid al-Adha holiday','expected'],
    ['2027-06-06','Islamic New Year','expected'],
    ['2027-06-30','June 30 Revolution','expected'],
    ['2027-07-23','July 23 Revolution Day','expected'],
    ['2027-08-14','Prophet\'s Birthday','expected'],
    ['2027-10-06','Armed Forces Day','expected']
  ].map(([date, name, status]) => ({ date, name, status }));
  const HOLIDAY_SETS = { EG: { name: 'Egypt', list: EG_HOLIDAYS, through: '2027-12-31' } };
  function holidayList(settings, start, end) {
    const H = settings.holidays || { country: 'none', removed: [], added: [] };
    const set = HOLIDAY_SETS[H.country];
    const out = [];
    if (set) for (const h of set.list) if (h.date >= start && h.date <= end) out.push(Object.assign({}, h, { source: 'builtin', removed: (H.removed || []).includes(h.date) }));
    for (const h of (H.added || [])) if (h.date >= start && h.date <= end) out.push({ date: h.date, name: h.name, status: 'added', source: 'added', removed: false });
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  function holidayFor(date, settings) {
    const H = settings.holidays; if (!H) return null;
    const a = (H.added || []).find(h => h.date === date); if (a) return { name: a.name, status: 'added' };
    const set = HOLIDAY_SETS[H.country]; if (!set || (H.removed || []).includes(date)) return null;
    const b = set.list.find(h => h.date === date); return b ? { name: b.name, status: b.status } : null;
  }

  /* ---------- default state ---------- */
  function defaultState() {
    return {
      v: 1, rev: 0, person: '',
      settings: {
        tz: 'Asia/Riyadh', includeToday: true, planningTargetSec: null,
        schedules: [{ from: '2000-01-01', workdays: [0, 1, 2, 3, 4], dailySec: 28800 }],
        policies: [{ from: '2000-01-01', idlePct: 33, shortfallMethod: 'period', partialLeave: false }],
        holidays: { country: 'EG', removed: [], added: [] }
      },
      days: {}, summaries: [], batches: []
    };
  }
  function versionFor(list, date) {
    let best = list[0];
    for (const v of list) if (v.from <= date && v.from >= best.from) best = v;
    return best;
  }
  function requiredSec(date, day, settings, policy) {
    const sch = versionFor(settings.schedules, date);
    if (!sch.workdays.includes(weekday(date))) return 0;
    const kind = day && day.kind;
    if (kind === 'holiday' || kind === 'leave') return 0;
    if (holidayFor(date, settings)) return 0;
    // Company rule: leave is taken in 0.25 (2h), 0.5 (4h) or 1 (8h) day units.
    if (kind === 'partial') return Math.max(0, sch.dailySec - (day.leaveSec || 0));
    return sch.dailySec;
  }
  const hasT = day => !!day && typeof day.t === 'number';

  /* ---------- main period calculation ---------- */
  function computePeriod(state, key, asOfIn, today) {
    const P = periodByKey(key), S = state.settings;
    const policy = versionFor(S.policies, P.start);
    const schedule = versionFor(S.schedules, P.start);
    let status = today < P.start ? 'upcoming' : today > P.end ? 'closed' : 'open';
    let asOf = asOfIn || (status === 'closed' ? P.end : status === 'upcoming' ? P.start : today);
    if (asOf < P.start) asOf = P.start; if (asOf > P.end) asOf = P.end;
    const reviewClosed = asOf === P.end && today > P.end;
    const includeToday = reviewClosed ? false : !!S.includeToday;
    const completedEnd = includeToday ? addDays(asOf, -1) : asOf;

    const rows = []; let tracked = 0, schedSec = 0, schedDays = 0;
    let trackedCompleted = 0, reqCompleted = 0, reqCompletedKnown = 0, completedDays = 0, missing = [];
    let dailyShort = 0, dailyShortMissing = 0, futureDays = 0, futureSec = 0;
    for (const date of dateRange(P.start, P.end)) {
      const day = state.days[date];
      const req = requiredSec(date, day, S, policy);
      const t = hasT(day) ? day.t : null;
      const completed = date <= completedEnd;
      const isToday = includeToday && date === asOf;
      const inScope = date <= asOf;
      if (req > 0) { schedSec += req; schedDays++; }
      if (inScope && t !== null) tracked += t;
      let st;
      const flags = [];
      if (!inScope) st = 'future';
      else if (isToday) st = 'today';
      else if (req === 0) st = t > 0 ? 'off' : 'rest';
      else if (t === null) st = 'missing';
      else if (t === 0) st = 'zero';
      else if (t < req) st = 'short';
      else st = 'met';
      const hol = holidayFor(date, S);
      if (day && (day.kind === 'holiday' || day.kind === 'leave') && t > 0) flags.push('Tracked time on a ' + (day.kind === 'leave' ? 'leave' : 'holiday') + ' day');
      else if (hol && t > 0 && versionFor(S.schedules, date).workdays.includes(weekday(date))) flags.push('Tracked time on a public holiday');
      if (day && day.noAssign && day.noAssign.status === 'pending') flags.push('No-assignment exception awaiting review');
      if (completed) {
        if (t !== null) trackedCompleted += t;
        if (req > 0) {
          completedDays++; reqCompleted += req;
          if (t === null) { missing.push(date); dailyShortMissing += req; }
          else { reqCompletedKnown += req; dailyShort += Math.max(0, req - t); }
        }
      } else if (date > asOf && req > 0) { futureDays++; futureSec += req; }
      rows.push({ date, wd: weekday(date), req, t, st, day: day || null, hol, completed, flags, short: completed && req > 0 && t !== null ? Math.max(0, req - t) : null });
    }
    // today's remaining
    let todayCounts = false, todayRemain = 0, todayT = 0;
    if (includeToday) {
      const d = state.days[asOf]; const req = requiredSec(asOf, d, S, policy); todayT = hasT(d) ? d.t : 0;
      todayRemain = Math.max(0, req - todayT); todayCounts = req > 0 && todayRemain > 0;
    }
    const workdaysLeft = futureDays + (todayCounts ? 1 : 0);
    const leftDates = rows.filter(r => r.req > 0 && (r.date > asOf || (todayCounts && r.date === asOf)))
      .map(r => ({ date: r.date, today: r.date === asOf, req: r.date === asOf ? todayRemain : r.req, done: r.date === asOf ? todayT : 0 }));
    const schedLeft = futureSec + (includeToday ? todayRemain : 0);
    const goalBasis = S.planningTargetSec ? 'target' : 'schedule';
    const goal = S.planningTargetSec || schedSec;
    const toGoal = Math.max(0, goal - tracked);
    const pace = workdaysLeft > 0 && toGoal > 0 ? toGoal / workdaysLeft : null;

    // projection: average of tracked time (weekends included) per completed scheduled workday
    let projection = null;
    if (completedDays > 0) {
      const avg = trackedCompleted / completedDays;
      const todayPart = includeToday ? (todayCounts ? Math.max(todayT, avg) : todayT) : 0;
      const finish = trackedCompleted + todayPart + avg * futureDays;
      projection = { avg, finish, variance: finish - goal, basisDays: completedDays, provisional: missing.length > 0 };
    }
    // shortfall
    const periodLow = Math.max(0, reqCompletedKnown - trackedCompleted);
    const periodHigh = Math.max(0, reqCompleted - trackedCompleted);
    const shortfall = {
      method: policy.shortfallMethod,
      period: { sec: periodHigh, low: periodLow },
      daily: { sec: dailyShort, high: dailyShort + dailyShortMissing },
      provisional: missing.length > 0, completedDays,
      throughDate: completedEnd < P.start ? null : completedEnd
    };
    const primary = policy.shortfallMethod === 'daily' ? { sec: dailyShort, high: dailyShort + dailyShortMissing } : { sec: periodLow, high: periodHigh };
    shortfall.primary = primary;

    const idle = computeIdle(state, P, asOf, policy);
    return { P, status, asOf, includeToday, completedEnd, policy, schedule, rows, tracked, schedSec, schedDays,
      workdaysLeft, leftDates, schedLeft, goal, goalBasis, toGoal, pace, projection, shortfall, missing, idle,
      leaveDays: rows.reduce((a, r) => a + leaveFrac(r.day), 0),
      final: status === 'closed' && asOf === P.end ? { variance: tracked - goal } : null };
  }

  /* ---------- idle ---------- */
  function idleMath(trackedSec, idleSec, meetSec, pct) {
    const net = Math.max(0, idleSec - meetSec);
    const excessX100 = net * 100 - trackedSec * pct; // exact integer comparison
    const excess = excessX100 > 0 ? excessX100 / 100 : 0;
    return { tracked: trackedSec, idle: idleSec, meeting: meetSec, net, allowed: trackedSec * pct / 100, excess, days: excess / LEAVE_DAY_SEC };
  }
  function reconcile(state, s) {
    const dates = dateRange(s.start, s.end);
    const withRec = dates.filter(d => hasT(state.days[d]));
    if (withRec.length === 0) return { state: 'needs-daily', label: 'Daily report needed', missing: dates };
    const miss = dates.filter(d => !hasT(state.days[d]));
    const sum = withRec.reduce((a, d) => a + state.days[d].t, 0);
    if (miss.length) return { state: 'needs-daily', label: 'Daily report needed', missing: miss, sum };
    if (sum !== s.tracked) return { state: 'differ', label: 'Tracked totals differ', diff: sum - s.tracked, sum };
    return { state: 'matched', label: 'Matched', sum };
  }
  function computeIdle(state, P, asOf, policy) {
    const pct = policy.idlePct;
    const sums = state.summaries.filter(s => s.start >= P.start && s.end <= P.end).sort((a, b) => (a.end < b.end ? 1 : -1));
    const summary = sums[0] || null;
    const out = { pct, summary, rec: null, result: null, source: null, notes: [], extra: [] };
    // daily-detail path: every tracked date up to asOf has idle & meeting values
    const scope = dateRange(P.start, asOf).filter(d => hasT(state.days[d]) && state.days[d].t > 0);
    const dailyComplete = scope.length > 0 && scope.every(d => typeof state.days[d].idle === 'number' && typeof state.days[d].meet === 'number');
    if (dailyComplete) {
      let T = 0, I = 0, M = 0;
      for (const d of scope) { const x = state.days[d]; if (excluded(x)) continue; T += x.t; I += x.idle; M += x.meet; }
      out.result = idleMath(T, I, M, pct); out.source = 'daily'; out.scope = { start: P.start, end: asOf };
      return out;
    }
    if (!summary) return out;
    out.rec = reconcile(state, summary);
    out.scope = { start: summary.start, end: summary.end };
    out.extra = dateRange(addDays(summary.end, 1), asOf).filter(d => d <= P.end && hasT(state.days[d]) && state.days[d].t > 0);
    if (out.rec.state !== 'matched') return out;
    let T = summary.tracked, I = summary.idle, M = summary.meeting, pending = [];
    for (const d of dateRange(summary.start, summary.end)) {
      const x = state.days[d];
      if (!excluded(x)) continue;
      if (typeof x.idle === 'number' && typeof x.meet === 'number') { I -= x.idle; M -= x.meet; T -= x.t; }
      else pending.push(d);
    }
    if (pending.length) { out.pending = pending; return out; }
    out.result = idleMath(T, Math.max(0, I), Math.max(0, M), pct); out.source = 'summary';
    return out;
  }
  function excluded(x) { return !!(x && x.noAssign && (x.noAssign.status === 'approved' || x.noAssign.status === 'reported')); }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = []; let row = [], f = '', q = false, i = 0, line = 1, rowLine = 1;
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
        if (c === '\n') line++;
        f += c; i++; continue;
      }
      if (c === '"' && f === '') { q = true; i++; continue; }
      if (c === ',') { row.push(f); f = ''; i++; continue; }
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (c === '\n' || c === '\r') { row.push(f); rows.push({ cells: row, line: rowLine }); row = []; f = ''; i++; line++; rowLine = line; continue; }
      f += c; i++;
    }
    if (f !== '' || row.length) { row.push(f); rows.push({ cells: row, line: rowLine }); }
    return rows.filter(r => r.cells.some(c => c.trim() !== ''));
  }
  const norm = h => h.trim().toLowerCase().replace(/\s+/g, ' ');
  function detect(headers) {
    const H = headers.map(norm);
    const has = h => H.indexOf(h);
    if (has('name') >= 0 && has('total time tracked (digital)') >= 0) return 'activity';
    if (has('date') >= 0 && (has('total (digital)') >= 0 || has('total (hours & minutes)') >= 0)) return 'hours';
    if (has('date') >= 0 && has('hours') >= 0) return 'normalized';
    return null;
  }
  function rangeFromName(name) {
    const m = /(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/.exec(name || '');
    if (!m || !isValidISO(m[1]) || !isValidISO(m[2]) || m[1] > m[2]) return null;
    return { start: m[1], end: m[2] };
  }
  function resolveDate(raw, range) {
    const s = raw.trim();
    if (isValidISO(s)) return { date: s };
    const m = /^(?:([A-Za-z]{3})[a-z]*,?\s+)?([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(s);
    if (!m) return { error: `"${s}" is not a recognised date` };
    const mi = MONTHS.indexOf(m[2].toLowerCase()); if (mi < 0) return { error: `"${s}" has an unknown month` };
    const day = +m[3];
    let cands;
    if (m[4]) cands = [iso(+m[4], mi + 1, day)];
    else {
      if (!range) return { needRange: true };
      const ys = [...new Set([+range.start.slice(0, 4), +range.end.slice(0, 4)])];
      cands = ys.map(y => iso(y, mi + 1, day)).filter(d => isValidISO(d) && d >= range.start && d <= range.end);
      if (cands.length !== 1) return { error: `"${s}" does not fall on exactly one date inside ${range.start} – ${range.end}` };
    }
    const d = cands[0];
    if (!isValidISO(d)) return { error: `"${s}" is not a real date` };
    if (m[1] && WD.indexOf(m[1].toLowerCase()) !== weekday(d)) return { error: `"${s}": ${d} is a ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][weekday(d)]}` };
    if (range && (d < range.start || d > range.end)) return { error: `${d} is outside the report range ${range.start} – ${range.end}` };
    return { date: d };
  }

  /* Parse one file into a normalized batch proposal. */
  function parseReport(text, fileName, manualRange) {
    const res = { fileName, kind: null, errors: [], warnings: [], records: [], summary: null, range: null, needRange: false };
    let rows;
    try { rows = parseCSV(text); } catch (e) { res.errors.push('The file could not be read as CSV.'); return res; }
    if (!rows.length) { res.errors.push(`${fileName}: the file is empty.`); return res; }
    const headers = rows[0].cells; const H = headers.map(norm); const col = h => H.indexOf(h);
    res.kind = detect(headers);
    if (!res.kind) { res.errors.push(`${fileName}: unrecognised columns (${headers.join(', ')}). Expected an Hours Tracked, Activity Summary or date,hours CSV.`); return res; }
    res.range = manualRange || rangeFromName(fileName);
    const at = r => `${fileName}, row ${r.line}`;
    if (res.kind === 'activity') {
      const data = rows.slice(1);
      const names = [...new Set(data.map(r => (r.cells[col('name')] || '').trim()).filter(Boolean))];
      if (data.length === 0) { res.errors.push(`${fileName}: no person rows found.`); return res; }
      if (names.length > 1 || data.length > 1) { res.errors.push(`${fileName}: this summary lists ${data.length} people. Export the Activity Summary for one person and upload that.`); return res; }
      if (!res.range) { res.needRange = true; }
      const r = data[0], g = h => r.cells[col(h)];
      const tr = parseDuration(g('total time tracked (digital)'));
      const idleC = col('idle minutes (digital)') >= 0 ? 'idle minutes (digital)' : null;
      const meetC = col('meeting time (digital)') >= 0 ? 'meeting time (digital)' : null;
      if (!idleC || !meetC) res.errors.push(`${fileName}: Idle Minutes (Digital) and Meeting Time (Digital) columns are required.`);
      const id = idleC ? parseDuration(g(idleC)) : { blank: true }, mt = meetC ? parseDuration(g(meetC)) : { blank: true };
      for (const [lbl, p] of [['Total Time Tracked', tr], ['Idle Minutes', id], ['Meeting Time', mt]]) {
        if (p.error) res.errors.push(`${at(r)}: ${lbl} ${p.error}`);
        else if (p.blank) res.errors.push(`${at(r)}: ${lbl} is blank.`);
      }
      if (res.errors.length) return res;
      if (res.range && periodKeyFor(res.range.start) !== periodKeyFor(res.range.end)) {
        res.errors.push(`${fileName}: the report covers ${res.range.start} – ${res.range.end}, which spans two payroll periods. Export one Activity Summary per period.`); return res;
      }
      const pct = {};
      H.forEach((h, i) => { if (h.endsWith('%')) pct[headers[i].trim()] = (r.cells[i] || '').trim(); });
      res.summary = { name: names[0], tracked: tr.sec, idle: id.sec, meeting: mt.sec, pct };
      return res;
    }
    // hours / normalized
    const dC = col('date');
    const digC = col('total (digital)'), dispC = col('total (hours & minutes)'), hC = col('hours');
    const nameC = col('name') >= 0 ? col('name') : col('user');
    if (nameC >= 0) {
      const names = new Set(rows.slice(1).map(r => (r.cells[nameC] || '').trim()).filter(Boolean));
      if (names.size > 1) { res.errors.push(`${fileName}: rows belong to ${names.size} people. Upload one person's daily report.`); return res; }
    }
    const seen = {};
    for (const r of rows.slice(1)) {
      const rawD = (r.cells[dC] || '').trim();
      if (!rawD) { res.errors.push(`${at(r)}: date is blank.`); continue; }
      const rd = resolveDate(rawD, res.range);
      if (rd.needRange) { res.needRange = true; continue; }
      if (rd.error) { res.errors.push(`${at(r)}: ${rd.error}`); continue; }
      let raw = res.kind === 'hours' ? (digC >= 0 && (r.cells[digC] || '').trim() !== '' ? r.cells[digC] : (dispC >= 0 ? r.cells[dispC] : '')) : r.cells[hC];
      const p = parseDuration(raw);
      if (p.error) { res.errors.push(`${at(r)}: ${p.error}`); continue; }
      if (p.blank) { res.warnings.push(`${at(r)} (${rd.date}): value is blank, so the date is left unchanged.`); continue; }
      if (p.sec > DAY_SEC) { res.errors.push(`${at(r)} (${rd.date}): ${fmtHMS(p.sec)} is more than 24 hours. This looks like a team or aggregate total, which cannot be attached to one person.`); continue; }
      if (seen[rd.date] !== undefined) {
        if (seen[rd.date] === p.sec) res.warnings.push(`${at(r)}: ${rd.date} appears twice with the same value; counted once.`);
        else res.errors.push(`${at(r)}: ${rd.date} appears twice with different values (${fmtHMS(seen[rd.date])} and ${fmtHMS(p.sec)}).`);
        continue;
      }
      seen[rd.date] = p.sec; res.records.push({ date: rd.date, sec: p.sec, line: r.line });
    }
    if (res.needRange) { res.records = []; return res; }
    if (!res.range && res.records.length) {
      const ds = res.records.map(r => r.date).sort(); res.range = { start: ds[0], end: ds[ds.length - 1] };
    }
    return res;
  }

  /* ---------- hashing (FNV-1a 64-bit on text) ---------- */
  function hashText(t) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  /* ---------- plan + apply imports ---------- */
  function planImport(state, parsed, hash) {
    const plan = { parsed, hash, adds: [], replaces: [], same: [], manualOverrides: [], periods: [], duplicate: null, summaryReplace: null, nameMismatch: false, total: 0 };
    const prior = state.batches.find(b => b.hash === hash && !b.undone && (!b.person || !state.person || norm(b.person) === norm(state.person)));
    if (prior) plan.duplicate = prior;
    if (parsed.kind === 'activity') {
      const s = parsed.summary; plan.total = s.tracked;
      plan.periods = [periodKeyFor(parsed.range.start)];
      plan.summaryReplace = state.summaries.find(x => x.start === parsed.range.start && x.end === parsed.range.end) || null;
      if (state.person && norm(state.person) !== norm(s.name)) plan.nameMismatch = true;
      // predicted reconciliation
      plan.rec = reconcile(state, { start: parsed.range.start, end: parsed.range.end, tracked: s.tracked });
      return plan;
    }
    const per = new Set();
    for (const r of parsed.records) {
      per.add(periodKeyFor(r.date)); plan.total += r.sec;
      const cur = state.days[r.date];
      if (!hasT(cur)) plan.adds.push(r);
      else if (cur.t === r.sec) plan.same.push(r);
      else { plan.replaces.push({ ...r, before: cur.t, src: cur.tSrc }); if (cur.tSrc === 'manual') plan.manualOverrides.push(r.date); }
    }
    plan.periods = [...per].sort();
    // reconciliation preview against stored summaries
    const sim = JSON.parse(JSON.stringify(state));
    for (const r of parsed.records) sim.days[r.date] = Object.assign({}, sim.days[r.date], { t: r.sec });
    plan.recs = sim.summaries.filter(s => parsed.records.some(r => r.date >= s.start && r.date <= s.end)).map(s => ({ s, rec: reconcile(sim, s) }));
    return plan;
  }
  function newId() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function applyImport(state, plan, meta) {
    const st = JSON.parse(JSON.stringify(state));
    const p = plan.parsed, id = newId(), at = meta.at;
    const batch = { id, type: p.kind, file: p.fileName, hash: plan.hash, person: st.person || (p.summary && p.summary.name) || '', range: p.range, at, by: meta.by || 'you', changes: [], undone: false };
    if (p.kind === 'activity') {
      if (!st.person) st.person = p.summary.name;
      batch.person = st.person;
      const prev = st.summaries.find(x => x.start === p.range.start && x.end === p.range.end) || null;
      st.summaries = st.summaries.filter(x => x !== prev && !(x.start === p.range.start && x.end === p.range.end));
      st.summaries.push({ id, name: p.summary.name, start: p.range.start, end: p.range.end, tracked: p.summary.tracked, idle: p.summary.idle, meeting: p.summary.meeting, pct: p.summary.pct, at });
      batch.summaryBefore = prev; batch.summaryId = id;
    } else {
      for (const r of [...plan.adds, ...plan.replaces]) {
        const cur = st.days[r.date] || {};
        batch.changes.push({ date: r.date, before: hasT(cur) ? cur.t : null, beforeSrc: cur.tSrc || null, after: r.sec });
        st.days[r.date] = Object.assign({}, cur, { t: r.sec, tSrc: p.kind === 'hours' ? 'hours-csv' : 'csv', tBatch: id, tOrig: undefined });
        delete st.days[r.date].tOrig;
      }
      batch.unchanged = plan.same.length;
    }
    st.batches.unshift(batch); st.batches = st.batches.slice(0, 80);
    return { state: st, batch };
  }
  function undoBatch(state, batchId) {
    const st = JSON.parse(JSON.stringify(state));
    const b = st.batches.find(x => x.id === batchId);
    if (!b || b.undone) return { state, restored: 0, skipped: [] };
    let restored = 0; const skipped = [];
    if (b.type === 'activity') {
      st.summaries = st.summaries.filter(s => s.id !== b.summaryId);
      if (b.summaryBefore) st.summaries.push(b.summaryBefore);
      restored = 1;
    } else {
      for (const c of b.changes) {
        const cur = st.days[c.date];
        if (!cur || cur.t !== c.after || (cur.tBatch !== b.id)) { skipped.push(c.date); continue; }
        if (c.before === null) { delete cur.t; delete cur.tSrc; delete cur.tBatch; if (Object.keys(cur).length === 0) delete st.days[c.date]; }
        else { cur.t = c.before; cur.tSrc = c.beforeSrc; delete cur.tBatch; }
        restored++;
      }
    }
    b.undone = true; b.undoneSkipped = skipped;
    return { state: st, restored, skipped };
  }
  function applyManual(state, date, patch, meta) {
    const st = JSON.parse(JSON.stringify(state));
    const cur = st.days[date] || {}; const before = JSON.parse(JSON.stringify(cur));
    const next = Object.assign({}, cur);
    if ('t' in patch) {
      if (patch.t === null) { delete next.t; delete next.tSrc; delete next.tBatch; delete next.tOrig; }
      else if (patch.t !== cur.t) {
        if (hasT(cur) && cur.tSrc !== 'manual' && next.tOrig === undefined) next.tOrig = { sec: cur.t, src: cur.tSrc, batch: cur.tBatch };
        next.t = patch.t; next.tSrc = 'manual'; delete next.tBatch;
      }
    }
    for (const k of ['idle', 'meet', 'leaveSec']) if (k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
    for (const k of ['kind', 'reason', 'noAssign', 'offsite', 'note']) if (k in patch) { if (patch[k] === null || patch[k] === '') delete next[k]; else next[k] = patch[k]; }
    next.updatedAt = meta.at;
    st.days[date] = next;
    st.batches.unshift({ id: newId(), type: 'manual', file: 'Manual edit', person: st.person, range: { start: date, end: date }, at: meta.at, by: meta.by || 'you', manual: { date, before, after: JSON.parse(JSON.stringify(next)) }, undone: false });
    st.batches = st.batches.slice(0, 80);
    return st;
  }
  /* Mark approved leave across a date range. Only scheduled workdays that are not
     public holidays are marked; weekends and holidays are skipped and listed. */
  function planLeave(state, req) {
    const days = [], skipped = [];
    for (const date of dateRange(req.start, req.end)) {
      const sch = versionFor(state.settings.schedules, date);
      if (!sch.workdays.includes(weekday(date))) { skipped.push({ date, why: 'weekend' }); continue; }
      const h = holidayFor(date, state.settings);
      if (h) { skipped.push({ date, why: h.name }); continue; }
      const cur = state.days[date];
      days.push({ date, already: !!(cur && cur.kind === 'leave') });
    }
    return { days, skipped };
  }
  function applyLeave(state, req, meta) {
    const st = JSON.parse(JSON.stringify(state));
    const plan = planLeave(st, req); const id = newId(); const changes = [];
    for (const d of plan.days) {
      const cur = st.days[d.date] || {}; const before = JSON.parse(JSON.stringify(cur));
      const next = Object.assign({}, cur, { kind: req.part === 'partial' ? 'partial' : 'leave', reason: req.reason, leaveType: req.leaveType, leaveRef: req.ref || undefined, updatedAt: meta.at });
      if (req.part === 'partial') next.leaveSec = req.leaveSec; else delete next.leaveSec;
      if (!next.leaveRef) delete next.leaveRef;
      st.days[d.date] = next; changes.push({ date: d.date, before, after: JSON.parse(JSON.stringify(next)) });
    }
    st.batches.unshift({ id, type: 'leave', file: (req.leaveType || 'Approved leave') + (req.part === 'partial' ? ' (partial day)' : ''), person: st.person, range: { start: req.start, end: req.end }, at: meta.at, by: meta.by || 'you', leave: changes, detail: changes.length + ' workday' + (changes.length === 1 ? '' : 's'), undone: false });
    st.batches = st.batches.slice(0, 80);
    return { state: st, count: changes.length, skipped: plan.skipped };
  }
  function undoLeave(state, batchId) {
    const st = JSON.parse(JSON.stringify(state));
    const b = st.batches.find(x => x.id === batchId);
    if (!b || b.undone || !b.leave) return { state, restored: 0, skipped: [] };
    let restored = 0; const skipped = [];
    for (const c of b.leave) {
      const cur = st.days[c.date];
      if (JSON.stringify(cur) !== JSON.stringify(c.after)) { skipped.push(c.date); continue; }
      if (Object.keys(c.before).length) st.days[c.date] = c.before; else delete st.days[c.date];
      restored++;
    }
    b.undone = true; b.undoneSkipped = skipped; return { state: st, restored, skipped };
  }
  function undoManual(state, batchId) {
    const st = JSON.parse(JSON.stringify(state));
    const b = st.batches.find(x => x.id === batchId);
    if (!b || b.undone || !b.manual) return { state, ok: false };
    const cur = st.days[b.manual.date];
    if (JSON.stringify(cur) !== JSON.stringify(b.manual.after)) return { state, ok: false, reason: 'The date was changed again after this edit.' };
    if (Object.keys(b.manual.before).length) st.days[b.manual.date] = b.manual.before; else delete st.days[b.manual.date];
    b.undone = true; return { state: st, ok: true };
  }

  /* ---------- export ---------- */
  function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // formula-injection guard
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCSV(calc, state) {
    const P = calc.P, out = [];
    out.push(['Payroll period', `${P.start} to ${P.end}`], ['As of', calc.asOf], ['Time zone', state.settings.tz],
      ['Shortfall method', calc.policy.shortfallMethod === 'daily' ? 'Day by day' : 'Monthly total (weekend hours count)'],
      ['Idle allowance %', calc.policy.idlePct], ['Coverage', calc.missing.length ? `${calc.missing.length} scheduled date(s) missing` : 'Complete'],
      ['Tracked', fmtHMS(calc.tracked)], ['Goal', fmtHMS(calc.goal)], ['Shortfall', fmtHMS(calc.shortfall.primary.sec)], []);
    out.push(['Date', 'Weekday', 'Required', 'Tracked', 'Shortfall', 'Idle', 'Meeting', 'Day type', 'Source', 'Status', 'Note']);
    for (const r of calc.rows) out.push([r.date, ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][r.wd], fmtHMS(r.req), r.t === null ? '' : fmtHMS(r.t), r.short === null ? '' : fmtHMS(r.short),
      r.day && typeof r.day.idle === 'number' ? fmtHMS(r.day.idle) : '', r.day && typeof r.day.meet === 'number' ? fmtHMS(r.day.meet) : '',
      (r.day && r.day.kind) || (r.hol ? 'public holiday: ' + r.hol.name : ''), (r.day && r.day.tSrc) || '', r.st, (r.day && r.day.note) || '']);
    return out.map(r => r.map(csvCell).join(',')).join('\r\n');
  }

  /* ---------- password lock: encrypts the ledger saved in this browser ----------
     PBKDF2-SHA256 turns the password into an AES-256-GCM key. Only the encrypted
     envelope is ever written to storage; the key lives in memory until the page locks. */
  const ENC_FORMAT = 'ptl-enc-v1';
  const ENC_ITER = 310000;
  const MIN_PASSWORD = 8;
  const webCrypto = () => {
    const c = (root && root.crypto) || globalThis.crypto;
    if (!c || !c.subtle) throw new Error('This browser cannot encrypt data. Open the page over https in an up-to-date browser.');
    return c;
  };
  const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  const wrongPassword = () => { const e = new Error('Wrong password.'); e.code = 'WRONG_PASSWORD'; return e; };
  function isEncrypted(x) {
    return !!x && typeof x === 'object' && x.format === ENC_FORMAT && typeof x.salt === 'string' && typeof x.iv === 'string' && typeof x.ct === 'string';
  }
  function passwordProblem(pw, again) {
    if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
    if (again !== undefined && pw !== again) return 'The two passwords do not match.';
    return null;
  }
  async function deriveKey(password, salt, iter) {
    const c = webCrypto();
    const base = await c.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return c.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function newLock(password, iter = ENC_ITER) {
    const salt = webCrypto().getRandomValues(new Uint8Array(16));
    return { key: await deriveKey(password, salt, iter), salt, iter };
  }
  async function sealJSON(obj, lock) {
    const c = webCrypto(); const iv = c.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, lock.key, new TextEncoder().encode(JSON.stringify(obj))));
    return { format: ENC_FORMAT, kdf: 'PBKDF2-SHA256', iter: lock.iter, salt: toB64(lock.salt), iv: toB64(iv), ct: toB64(ct) };
  }
  async function openWithLock(env, lock) {
    if (!isEncrypted(env)) throw new Error('This is not an encrypted ledger.');
    let pt;
    try { pt = await webCrypto().subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, lock.key, fromB64(env.ct)); }
    catch (e) { throw wrongPassword(); }
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function openJSON(env, password) {
    if (!isEncrypted(env)) throw new Error('This is not an encrypted ledger.');
    const iter = env.iter;
    if (!Number.isInteger(iter) || iter < 1000 || iter > 5000000) throw new Error('This encrypted ledger has unsupported settings.');
    let salt; try { salt = fromB64(env.salt); } catch (e) { throw new Error('This encrypted ledger is damaged.'); }
    const lock = { key: await deriveKey(password, salt, iter), salt, iter };
    return { data: await openWithLock(env, lock), lock };
  }

  const api = { DAY_SEC, LEAVE_DAY_SEC, iso, isValidISO, addDays, weekday, dateRange, todayIn, periodByKey, periodKeyFor, periodFor, shiftPeriod,
    LEAVE_UNITS, leaveFrac, parseDuration, fmtHM, fmtHMS, fmtDays, defaultState, versionFor, requiredSec, computePeriod, idleMath, reconcile, parseCSV, detect,
    rangeFromName, resolveDate, EG_HOLIDAYS, HOLIDAY_SETS, holidayList, holidayFor, planLeave, applyLeave, undoLeave, parseReport, hashText, planImport, applyImport, undoBatch, applyManual, undoManual, exportCSV, csvCell,
    ENC_FORMAT, MIN_PASSWORD, isEncrypted, passwordProblem, newLock, sealJSON, openWithLock, openJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TD = api;
})(typeof window !== 'undefined' ? window : globalThis);
