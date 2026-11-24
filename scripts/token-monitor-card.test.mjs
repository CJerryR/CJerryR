import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, normalizeUsage, renderCard } from './token-monitor-card.mjs';

const today = '2026-11-25';
function fixture() {
  return {
    periods: {
      allTime: {
        totalTokens: 1500,
        clients: { extra: 10, codex: 800, claude: 400, workbuddy: 200, antigravity: 90 },
      },
      today: { totalTokens: 120 },
    },
    devices: [{ hostname: 'PRIVATE_DEVICE', sessions: ['PRIVATE_SESSION'] }],
  };
}
const history = {
  daily: [
    { date: '2025-11-25', tokens: 5 },
    { date: '2025-11-26', tokens: 10 },
    { date: '2026-11-24', tokens: 50 },
    { date: '2026-11-25', tokens: 20 },
    { date: '2026-11-26', tokens: 500 },
  ],
};

test('lifetime includes every source while the ranking takes exactly four', () => {
  const usage = normalizeUsage(fixture(), history, today);
  assert.equal(usage.totalTokens, 1500);
  assert.deepEqual(usage.tools.map((tool) => tool.id), ['codex', 'claude', 'workbuddy', 'antigravity']);
  assert.equal(usage.tools.reduce((sum, tool) => sum + tool.tokens, 0), 1490);
});

test('rolling calendar has 365 days and overlays today without double counting', () => {
  const usage = normalizeUsage(fixture(), history, today);
  assert.equal(usage.start, '2025-11-26');
  assert.equal(usage.activeDays, 3);
  assert.equal(usage.daily.at(-1).tokens, 120);
  assert.equal(usage.daily.some((day) => day.date === '2026-11-26'), false);
  const svg = renderCard(usage);
  assert.equal((svg.match(/<title>\d{4}-\d{2}-\d{2}:/g) || []).length, 365);
  assert.match(svg, /2026-11-25: 120 tokens/);
});

test('date boundaries follow Shanghai even before the UTC date rolls over', () => {
  assert.equal(localDate(new Date('2026-11-24T16:01:00Z')), today);
  assert.equal(localDate(new Date('2026-11-24T15:59:00Z')), '2026-11-24');
});

test('missing, duplicate, and malformed history fail instead of publishing a blank graph', () => {
  assert.throws(() => normalizeUsage(fixture(), {}, today), /unavailable/);
  assert.throws(() => normalizeUsage(fixture(), { daily: [] }, today), /empty/);
  assert.throws(() => normalizeUsage(fixture(), { daily: [history.daily[0], history.daily[0]] }, today), /Duplicate/);
  assert.throws(() => normalizeUsage(fixture(), { daily: [{ date: '2026-02-30', tokens: 10 }] }, today), /Invalid date/);
  const stats = fixture();
  stats.periods.allTime.totalTokens = -1;
  assert.throws(() => normalizeUsage(stats, history, today), /Invalid token count/);
});

test('rendered themes escape source names and contain only aggregate usage', () => {
  const stats = fixture();
  stats.periods.allTime.clients = { '<private&source>': 1500 };
  const usage = normalizeUsage(stats, history, today);
  for (const theme of ['dark', 'light']) {
    const svg = renderCard(usage, theme);
    assert.match(svg, /&lt;private&amp;source&gt;/);
    assert.doesNotMatch(svg, /PRIVATE_DEVICE|PRIVATE_SESSION|hostname|authorization|costUsd/);
    assert.match(svg, /viewBox="0 0 900 640"/);
  }
});

test('all-zero real usage renders without NaN or imaginary top sources', () => {
  const stats = { periods: { allTime: { totalTokens: 0, clients: {} }, today: { totalTokens: 0 } } };
  const usage = normalizeUsage(stats, { daily: [] }, today);
  assert.equal(usage.activeDays, 0);
  assert.equal(usage.tools.length, 0);
  assert.doesNotMatch(renderCard(usage), /NaN|Infinity/);
});
