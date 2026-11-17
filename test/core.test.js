const T = require('../src/core.js'); const fs = require('fs'); const path = require('path');
const FX = f => path.join(__dirname, 'fixtures', f);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const at = { at: '2026-11-18T09:00:00Z', by: 'test' };
const H = fs.readFileSync(FX('hours-tracked-report-totals-2026-10-21_2026-11-16.csv'), 'utf8');
const A = fs.readFileSync(FX('activity-summary-2026-10-21_2026-11-16.csv'), 'utf8')
// Independent expectations, derived directly from the fixture text (not from the engine).
const hms = x => { const [h, m, s] = x.split(':').map(Number); return h * 3600 + m * 60 + s; };
const fxRows = H.trim().split('\n').slice(1).map(l => { const m = /^"([^"]+)",[^,]*,(.+)$/.exec(l); return { label: m[1], sec: hms(m[2]), line: l }; });
const fxDates = T.dateRange('2026-10-21', '2026-11-16'); const fxBy = {}; fxRows.forEach((r, i) => fxBy[fxDates[i]] = r);
const FX_TOTAL = fxRows.reduce((a, r) => a + r.sec, 0);
const aCells = A.trim().split('\n')[1].split(','); const FX_IDLE = hms(aCells[3]), FX_MEET = hms(aCells[5]);
const isWork = d => [0, 1, 2, 3, 4].includes(T.weekday(d));
const workThru16 = fxDates.filter(isWork);
const FX_DAILY_SHORT = workThru16.reduce((a, d) => a + Math.max(0, 28800 - fxBy[d].sec), 0);
const FX_PERIOD_SHORT = Math.max(0, workThru16.length * 28800 - FX_TOTAL);;
const HN = 'hours-tracked-report-totals-2026-10-21_2026-11-16.csv', AN = 'activity-summary-2026-10-21_2026-11-16.csv';
const imp = (st, text, name, range) => { const p = T.parseReport(text, name, range); const plan = T.planImport(st, p, T.hashText(text)); return { p, plan, ...T.applyImport(st, plan, at) }; };

// 1 payroll boundaries
eq(T.periodKeyFor('2026-10-21'), '2026-11', 'Oct 21'); eq(T.periodKeyFor('2026-11-20'), '2026-11', 'Nov 20'); eq(T.periodKeyFor('2026-11-21'), '2026-12', 'Nov 21');
eq(T.periodByKey('2027-01'), { key: '2027-01', start: '2026-12-21', end: '2027-01-20', year: 2027, month: 1 }, 'Dec-Jan');
eq(T.periodKeyFor('2026-12-25'), '2027-01', 'Dec 25'); eq(T.periodByKey('2028-03').start, '2028-02-21', 'leap start');
eq(T.dateRange(T.periodByKey('2028-03').start, T.periodByKey('2028-03').end).length, 29, 'leap Feb21-Mar20 = 29 days');
eq(T.dateRange(T.periodByKey('2027-03').start, T.periodByKey('2027-03').end).length, 28, 'non-leap = 28 days');
eq(T.shiftPeriod('2026-12', 1), '2027-01', 'shift'); eq(T.shiftPeriod('2027-01', -1), '2026-12', 'shift back');

// 2 sample imports
let st = T.defaultState();
let r = imp(st, H, HN); st = r.state;
eq(r.p.errors, [], 'hours errors'); eq(r.p.records.length, 27, '27 records'); eq(r.plan.total, FX_TOTAL, 'daily total');
eq(r.p.records[0].date, '2026-10-21', 'first date'); eq(r.p.records[0].sec, fxRows[0].sec, 'first digital value parsed'); eq(T.parseDuration('03:50:24').sec, 13824, '03:50:24 = 13824');
let r2 = imp(st, A, AN); st = r2.state;
eq(r2.p.errors, [], 'activity errors'); eq(r2.p.summary.tracked, FX_TOTAL, 'summary tracked');
// 3 idle
eq([r2.p.summary.idle, r2.p.summary.meeting], [FX_IDLE, FX_MEET], 'idle/meeting parse');
let c = T.computePeriod(st, '2026-11', '2026-11-16', '2026-11-18');
eq(c.idle.rec.state, 'matched', 'reconciled'); eq(c.idle.result.net, 0, 'net idle 0'); eq(c.idle.result.excess, 0, 'excess 0');
// 4 coverage: summary first then hours
let s2 = T.defaultState(); s2 = imp(s2, A, AN).state;
let c2 = T.computePeriod(s2, '2026-11', '2026-11-16', '2026-11-18'); eq(c2.idle.rec.state, 'needs-daily', 'summary first pending');
s2 = imp(s2, H, HN).state; c2 = T.computePeriod(s2, '2026-11', '2026-11-16', '2026-11-18'); eq(c2.idle.rec.state, 'matched', 'then matched');
let s3 = T.applyManual(s2, '2026-11-02', { t: 9 * 3600 }, at);
eq(T.computePeriod(s3, '2026-11', '2026-11-16', '2026-11-18').idle.rec.state, 'differ', 'changed daily → differ');
let s4 = T.applyManual(s2, '2026-11-17', { t: 3600 }, at);
let c4 = T.computePeriod(s4, '2026-11', '2026-11-17', '2026-11-18');
eq(c4.idle.extra, ['2026-11-17'], 'extra coverage date'); eq(c4.idle.rec.state, 'matched', 'still matched in its own scope');
// 5 duplicate & correction
let d1 = T.parseReport(H, HN); let dp = T.planImport(st, d1, T.hashText(H));
ok(dp.duplicate, 'duplicate detected'); eq(dp.adds.length + dp.replaces.length, 0, 'nothing changes'); eq(dp.same.length, 27, 'all same');
const N16 = fxBy['2026-11-16'].sec, NEW16 = N16 === 21600 ? 22000 : 21600;
const Hfix = H.replace(fxBy['2026-11-16'].line, '"Mon, Nov 16",x,' + T.fmtHMS(NEW16).padStart(8, '0'));
let fx = imp(st, Hfix, HN); eq(fx.plan.replaces.length, 1, 'one replace'); eq(fx.plan.replaces[0].before, N16, 'before value');
let cf = T.computePeriod(fx.state, '2026-11', '2026-11-16', '2026-11-18'); eq(cf.idle.rec.state, 'differ', 'correction → differ'); eq(cf.idle.rec.diff, NEW16 - N16, 'diff secs');
let un = T.undoBatch(fx.state, fx.batch.id); eq(un.restored, 1, 'undo restored'); eq(un.state.days['2026-11-16'].t, N16, 'undo value');
eq(T.computePeriod(un.state, '2026-11', '2026-11-16', '2026-11-18').idle.rec.state, 'matched', 'rematched after undo');
// undo accounts for later change
let later = T.applyManual(fx.state, '2026-11-16', { t: 7 * 3600 }, at); let un2 = T.undoBatch(later, fx.batch.id);
eq(un2.skipped, ['2026-11-16'], 'undo skips later-edited date');
// 6 calendar & leave
let sh = T.applyManual(st, '2026-11-12', { kind: 'leave', reason: 'Annual leave' }, at);
let ch = T.computePeriod(sh, '2026-11', '2026-11-16', '2026-11-18'); let row = ch.rows.find(x => x.date === '2026-11-12');
eq(row.req, 0, 'leave req 0'); ok(row.flags.length === 1, 'tracked on leave flagged'); eq(row.t, fxBy['2026-11-12'].sec, 'leave tracked kept');
let base = T.computePeriod(st, '2026-11', '2026-11-16', '2026-11-18'); eq(ch.schedSec, base.schedSec - 28800, 'leave reduces schedule');
ok(base.rows.find(x => x.date === '2026-10-24').st === 'rest' && base.rows.find(x => x.date === '2026-10-31').st === 'off', 'weekend 0 rest / tracked off');
let mz = T.applyManual(st, '2026-11-17', { t: 0 }, at); let cz = T.computePeriod(mz, '2026-11', '2026-11-18', '2026-11-18');
eq(cz.rows.find(x => x.date === '2026-11-17').st, 'zero', 'explicit zero'); eq(base.rows.find(x => x.date === '2026-11-12').st, 'short', 'short');
let cm = T.computePeriod(st, '2026-11', '2026-11-18', '2026-11-18'); eq(cm.rows.find(x => x.date === '2026-11-17').st, 'missing', 'missing distinct'); eq(cm.missing, ['2026-11-17'], 'missing list');
// 7 policy rules: 6h + 10h
let p = T.defaultState(); p.settings.policies[0].shortfallMethod = 'daily';
p = T.applyManual(p, '2026-11-01', { t: 6 * 3600 }, at); p = T.applyManual(p, '2026-11-02', { t: 10 * 3600 }, at);
let cp = T.computePeriod(p, '2026-11', '2026-11-02', '2026-11-18');
// only Nov 1-2 have data; check daily shortfall over those two days
const two = cp.rows.filter(x => x.date === '2026-11-01' || x.date === '2026-11-02').reduce((a, x) => a + x.short, 0); eq(two, 7200, '6h+10h → 2h daily shortfall');
eq(T.idleMath(100000, 33000, 0, 33).excess, 0, 'exactly 33% → 0'); ok(T.idleMath(100000, 33001, 0, 33).excess > 0, 'just above → positive');
eq(T.idleMath(100, 34, 1, 33).excess, 0, 'meeting brings to 33%');
// exception applies once (daily detail path)
let ex = T.defaultState(); ex = T.applyManual(ex, '2026-11-01', { t: 28800, idle: 20000, meet: 0, noAssign: { status: 'reported', ref: 'email' } }, at);
ex = T.applyManual(ex, '2026-11-02', { t: 28800, idle: 9000, meet: 0 }, at);
let ce = T.computePeriod(ex, '2026-11', '2026-11-02', '2026-11-18'); eq(ce.idle.source, 'daily', 'daily source'); eq(ce.idle.result.idle, 9000, 'exception day idle excluded once');
// 8 projection states
let e0 = T.computePeriod(T.defaultState(), '2026-11', '2026-10-21', '2026-10-21'); eq(e0.projection, null, 'no completed days → unavailable'); eq(e0.workdaysLeft, 22, 'workdays left new period');
eq(base.schedDays, 22, '22 Sun-Thu workdays in Nov period');
let prov = T.computePeriod(st, '2026-11', '2026-11-18', '2026-11-18'); ok(prov.projection.provisional, 'missing → provisional');
let tm = JSON.parse(JSON.stringify(st)); tm.settings.planningTargetSec = 100 * 3600; let ctm = T.computePeriod(tm, '2026-11', '2026-11-16', '2026-11-18'); eq(ctm.toGoal, 0, 'target met'); eq(ctm.pace, null, 'no pace when met');
let cl = T.computePeriod(st, '2026-11', null, '2026-11-25'); eq(cl.status, 'closed', 'closed'); eq(cl.workdaysLeft, 0, 'no days left'); eq(cl.pace, null, 'no pace closed'); ok(cl.toGoal > 0, 'owed hours closed'); ok(cl.final, 'final variance');
// partial today
let pt = T.applyManual(st, '2026-11-18', { t: 3 * 3600 }, at); let cpt = T.computePeriod(pt, '2026-11', '2026-11-18', '2026-11-18');
eq(cpt.workdaysLeft, 2, 'today+Thu (Nov 19); Nov 20 Fri'); eq(cpt.schedLeft, 5 * 3600 + 28800, 'today remaining + Thu');
// shortfall methods on sample through Nov 16
const nt = JSON.parse(JSON.stringify(st)); nt.settings.includeToday = false; const b16 = T.computePeriod(nt, '2026-11', '2026-11-16', '2026-11-18');
eq(b16.shortfall.daily.sec, FX_DAILY_SHORT, 'daily method'); eq(b16.shortfall.period.sec, FX_PERIOD_SHORT, 'period method');
// 9 CSV edge cases
const q = 'Total (Digital),Date\r\n"07:00:00","Sun, Nov 1"\r\n'; let pq = T.parseReport('\uFEFF' + q, HN.replace('totals', 'totals'), null);
eq(pq.errors, [], 'BOM+CRLF+reordered'); eq(pq.records[0].sec, 25200, 'reordered value');
eq(T.parseReport('Date,Total (Digital)\n"Wed, Oct 21",7:xx\n', HN).errors.length, 1, 'invalid duration');
ok(T.parseReport('Date,Total (Digital)\n"Wed, Oct 21",01:00:00\n"Wed, Oct 21",02:00:00\n', HN).errors[0].includes('twice'), 'conflicting dup');
ok(T.parseReport('Date,Total (Digital)\n"Thu, Oct 21",01:00:00\n', HN).errors[0].includes('Wednesday'), 'weekday mismatch');
ok(T.parseReport('Date,Total (Digital)\n"Wed, Oct 21",01:00:00\n', 'renamed.csv').needRange, 'renamed needs range');
eq(T.parseReport('Date,Total (Digital)\n"Wed, Oct 21",01:00:00\n', 'renamed.csv', { start: '2026-10-21', end: '2026-11-16' }).records[0].date, '2026-10-21', 'manual range');
let ny = T.parseReport('Date,Total (Digital)\n"Thu, Dec 31",01:00:00\n"Fri, Jan 1",01:00:00\n', 'hours-tracked-report-totals-2026-12-21_2027-01-05.csv');
eq(ny.records.map(x => x.date), ['2026-12-31', '2027-01-01'], 'new year span');
ok(T.parseReport('Date,Total (Digital)\n"Wed, Oct 21",45:00:00\n', HN).errors[0].includes('aggregate'), 'team total rejected');
ok(T.parseReport('Name,Total Time Tracked (Digital),Idle Minutes (Digital),Meeting Time (Digital)\nA,1:00:00,0:10:00,0:00:00\nB,1:00:00,0:10:00,0:00:00\n', AN).errors[0].includes('2 people'), 'multi person');
ok(T.parseReport('Name,Total Time Tracked (Digital),Idle Minutes (Digital),Meeting Time (Digital)\nA,1:00:00,0:10:00,0:00:00\n', 'activity-summary-2026-11-15_2026-11-25.csv').errors[0].includes('two payroll'), 'summary spanning periods');
eq(T.parseReport('date,hours\n2026-11-01,7.5\n2026-11-02,08:00:00\n2026-11-03,\n', 'x.csv').records.map(x => x.sec), [27000, 28800], 'normalized csv; blank skipped');
ok(T.parseReport('date,hours\n2026-11-03,\n', 'x.csv').warnings.length === 1, 'blank warned not zero');
eq(T.csvCell('=SUM(A1)'), "'=SUM(A1)", 'formula guard');
// --- holidays & leave ---
{
  const h = T.defaultState();
  eq(T.holidayFor('2026-10-08', h.settings).name.startsWith('Armed Forces'), true, 'Oct 8 2026 holiday');
  eq(T.requiredSec('2026-10-08', null, h.settings, h.settings.policies[0]), 0, 'holiday Thursday requires 0');
  eq(T.requiredSec('2026-10-06', null, h.settings, h.settings.policies[0]), 28800, 'Oct 6 is a normal workday (moved)');
  eq(T.computePeriod(h, '2027-01', '2026-12-21', '2026-12-21').schedDays, 22, 'Jan 2027 period: 23 Sun-Thu minus Jan 7 = 22');
  const off = JSON.parse(JSON.stringify(h)); off.settings.holidays.removed.push('2027-01-25'); off.settings.holidays.added.push({ date: '2027-01-28', name: 'Jan 25 (moved)' });
  eq(T.computePeriod(off, '2027-01', '2026-12-21', '2026-12-21').schedDays, 22, 'moved Jan 25 is in Feb period');
  eq(T.computePeriod(off, '2027-02', '2027-01-21', '2027-01-21').rows.find(r => r.date === '2027-01-28').req, 0, 'added holiday Jan 28'); eq(T.requiredSec('2027-01-25', null, off.settings, off.settings.policies[0]), 28800, 'removed date back to workday');
  const none = JSON.parse(JSON.stringify(h)); none.settings.holidays.country = 'none';
  eq(T.computePeriod(none, '2027-01', '2026-12-21', '2026-12-21').schedDays, 23, 'no calendar = 23');
  eq(T.computePeriod(st, '2026-11', '2026-11-16', '2026-11-18').schedDays, 22, 'Nov 2026 has no Egypt holidays');
  // leave range: Wed Jan 6 – Mon Jan 11 2027 → Jan 6, 10, 11 (Jan 7 holiday, Fri/Sat skipped)
  const L = T.applyLeave(h, { start: '2027-01-06', end: '2027-01-11', part: 'full', leaveType: 'Annual leave', reason: 'Annual leave' }, at);
  eq(L.count, 3, 'leave marks 3 workdays'); eq(L.skipped.map(x => x.date), ['2027-01-07', '2027-01-08', '2027-01-09'], 'skips holiday & weekend');
  eq(T.computePeriod(L.state, '2027-01', '2026-12-21', '2026-12-21').schedDays, 19, 'leave reduces schedule');
  const U = T.undoLeave(L.state, L.state.batches[0].id); eq(U.restored, 3, 'leave undo'); eq(Object.keys(U.state.days).length, 0, 'clean after undo');
  const P2 = T.applyLeave(h, { start: '2027-01-10', end: '2027-01-10', part: 'partial', leaveSec: 7200, leaveType: 'Casual leave', reason: 'x' }, at);
  eq(T.requiredSec('2027-01-10', P2.state.days['2027-01-10'], P2.state.settings, P2.state.settings.policies[0]), 21600, 'quarter day = 6h required');
eq(T.leaveFrac(P2.state.days['2027-01-10']), 0.25, 'quarter frac');
const half = T.applyManual(st, '2026-11-10', { kind: 'partial', leaveSec: 14400 }, at); const ch2 = T.computePeriod(half, '2026-11', '2026-11-16', '2026-11-18');
eq(ch2.schedSec, base.schedSec - 14400, 'half day reduces schedule 4h'); eq(ch2.leaveDays, 0.5, 'leave days 0.5');
  P2.state.settings.policies[0].partialLeave = true;
  eq(T.requiredSec('2027-01-10', P2.state.days['2027-01-10'], P2.state.settings, P2.state.settings.policies[0]), 21600, 'partial applied when enabled');
}
eq(cpt.leftDates.map(x => x.date), ['2026-11-18', '2026-11-19'], 'left dates today+Thu');
eq(cpt.leftDates[0].today, true, 'today flagged'); eq(cpt.leftDates[0].done, 3 * 3600, 'today done so far');
eq(T.computePeriod(st, '2026-11', null, '2026-11-25').leftDates.length, 0, 'closed: none left');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
