#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// capacity.test.js — v1.33.0
//
// Pure unit tests for the capacity + calendar helpers introduced in v1.33.0.
// These helpers live inside the 26k-line renderer/index.html, so we re-declare
// their pure-logic cores here and assert against them. When the in-app logic
// changes, update both in lock-step — the test is the contract.
//
// Run:   node tests/capacity.test.js
// Exit:  0 on pass, non-zero on any failure.
// ══════════════════════════════════════════════════════════════════════════════

let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else      { failed++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── 1. getCapHours defaults + overrides ─────────────────────────────────────
function getCapHours(appSettings) {
  const c = (appSettings && appSettings.capacity) || {};
  return {
    hpw:  parseFloat(c.hoursPerWeek) || 40,
    hpd:  parseFloat(c.hoursPerDay)  ||  8,
    days: parseInt(c.workDays, 10)   ||  5
  };
}

console.log('\n── getCapHours ──');
assert('defaults when appSettings missing',
  eq(getCapHours(null), { hpw: 40, hpd: 8, days: 5 }));
assert('defaults when capacity sub-object missing',
  eq(getCapHours({}), { hpw: 40, hpd: 8, days: 5 }));
assert('honours explicit 30h week',
  eq(getCapHours({ capacity: { hoursPerWeek: 30, hoursPerDay: 6, workDays: 5 } }),
     { hpw: 30, hpd: 6, days: 5 }));
assert('coerces stringy numbers',
  eq(getCapHours({ capacity: { hoursPerWeek: '37.5', hoursPerDay: '7.5', workDays: '5' } }),
     { hpw: 37.5, hpd: 7.5, days: 5 }));
assert('falls back on NaN input',
  eq(getCapHours({ capacity: { hoursPerWeek: 'bogus' } }),
     { hpw: 40, hpd: 8, days: 5 }));

// ── 2. _getTodosForWeek: pure date-range filter ─────────────────────────────
function _getTodosForWeek(todoAllData, weekStartDate) {
  const items = [];
  const weekEnd = new Date(weekStartDate); weekEnd.setDate(weekEnd.getDate() + 4);
  Object.keys(todoAllData).forEach(function (init) {
    (todoAllData[init] || []).forEach(function (t) {
      if (!t.due) return;
      const due = new Date(t.due);
      if (due >= weekStartDate && due <= weekEnd) {
        items.push({ initiative: init, task: t, hours: parseFloat(t.estimate) || 0 });
      }
    });
  });
  return items;
}

console.log('\n── _getTodosForWeek ──');
const fixtures = {
  'Launch Q2': [
    { id: 't1', text: 'Write spec',     due: '2026-04-13', estimate: '4'  },  // Mon of week
    { id: 't2', text: 'Review designs', due: '2026-04-17', estimate: '2.5' }, // Fri of week
    { id: 't3', text: 'Stakeholder',    due: '2026-04-20', estimate: '1'  },  // next Mon - OUT
    { id: 't4', text: 'No due',                             estimate: '5'  },  // no due - OUT
  ],
  'Backlog':   [
    { id: 't5', text: 'Housekeeping',   due: '2026-04-15', estimate: '0.5' }, // Wed of week
  ]
};
const weekStart = new Date('2026-04-13T00:00:00Z');
const wk = _getTodosForWeek(fixtures, weekStart);
assert('pulls 3 in-range todos', wk.length === 3, 'got ' + wk.length);
assert('sums to 7h', wk.reduce((a, b) => a + b.hours, 0) === 7);
assert('excludes todos without due', !wk.some(x => x.task.id === 't4'));
assert('excludes next week', !wk.some(x => x.task.id === 't3'));

// ── 3. Google event normalizer ──────────────────────────────────────────────
function _normalizeGoogleEvent(ev) {
  if (!ev || (ev.status === 'cancelled')) return null;
  const start = ev.start && (ev.start.dateTime || ev.start.date);
  const end   = ev.end   && (ev.end.dateTime   || ev.end.date);
  if (!start) return null;
  const s = new Date(start), e = end ? new Date(end) : new Date(s.getTime() + 60 * 60 * 1000);
  const durHrs = Math.max(0.25, Math.round(((e - s) / 3600000) * 4) / 4);
  return {
    name: ev.summary || '(no title)',
    date: s.toISOString().slice(0, 10),
    startTime: s.toTimeString().slice(0, 5),
    endTime:   e.toTimeString().slice(0, 5),
    duration:  durHrs,
    source: 'google',
    extId: ev.id
  };
}

console.log('\n── _normalizeGoogleEvent ──');
assert('rejects cancelled', _normalizeGoogleEvent({ status: 'cancelled', start: { dateTime: '2026-04-15T10:00:00Z' } }) === null);
assert('rejects null',      _normalizeGoogleEvent(null) === null);
assert('rejects start-less',_normalizeGoogleEvent({ summary: 'x' }) === null);
const g = _normalizeGoogleEvent({
  id: 'ev1', summary: 'Standup',
  start: { dateTime: '2026-04-15T09:00:00Z' },
  end:   { dateTime: '2026-04-15T09:30:00Z' }
});
assert('normalises 30m to 0.5h', g && g.duration === 0.5, 'got ' + (g && g.duration));
assert('date ISO extracted',     g && g.date === '2026-04-15');
assert('source tagged',          g && g.source === 'google');
assert('(no title) fallback',    _normalizeGoogleEvent({
  id: 'ev2',
  start: { dateTime: '2026-04-15T10:00:00Z' },
  end:   { dateTime: '2026-04-15T11:00:00Z' }
}).name === '(no title)');

// ── 4. MS Graph event normalizer ────────────────────────────────────────────
function _normalizeGraphEvent(ev) {
  if (!ev || ev.isCancelled) return null;
  const s = new Date(ev.start.dateTime + 'Z');
  const e = new Date(ev.end.dateTime   + 'Z');
  const durHrs = Math.max(0.25, Math.round(((e - s) / 3600000) * 4) / 4);
  return {
    name: ev.subject || '(no title)',
    date: s.toISOString().slice(0, 10),
    startTime: s.toTimeString().slice(0, 5),
    endTime:   e.toTimeString().slice(0, 5),
    duration:  durHrs,
    source: 'microsoft',
    extId: ev.id
  };
}

console.log('\n── _normalizeGraphEvent ──');
assert('rejects isCancelled', _normalizeGraphEvent({ isCancelled: true, start: {}, end: {} }) === null);
const m = _normalizeGraphEvent({
  id: 'ev3', subject: 'Quarterly Review',
  start: { dateTime: '2026-04-15T14:00:00' },
  end:   { dateTime: '2026-04-15T15:30:00' }
});
assert('normalises 90m to 1.5h', m && m.duration === 1.5);
assert('source = microsoft',     m && m.source === 'microsoft');
assert('extId preserved',        m && m.extId === 'ev3');

// ── 5. Timesheet target derivation ──────────────────────────────────────────
// Before v1.33.0 the timesheet target was hardcoded at 35h. Now it derives
// from getCapHours(appSettings).hpw.
console.log('\n── Timesheet target source ──');
assert('defaults to 40 when unset',
  getCapHours(undefined).hpw === 40);
assert('tracks user-configured 32h',
  getCapHours({ capacity: { hoursPerWeek: 32 } }).hpw === 32);

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n── Summary ──');
console.log('  ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
