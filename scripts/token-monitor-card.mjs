const DAY_MS = 86_400_000;
const TIME_ZONE = 'Asia/Shanghai';
const WIDTH = 900;
const HEIGHT = 640;
const LABELS = {
  codex: 'Codex',
  claude: 'Claude Code',
  'claude-code': 'Claude Code',
  workbuddy: 'WorkBuddy',
  antigravity: 'Antigravity',
  cline: 'Cline',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  copilot: 'GitHub Copilot',
  gemini: 'Gemini CLI',
};
const COLORS = {
  codex: '#48a9b4',
  claude: '#d4876b',
  'claude-code': '#d4876b',
  workbuddy: '#10bea2',
  antigravity: '#4b88ee',
};
const THEMES = {
  dark: {
    background: '#393d40',
    text: '#f0f6f4',
    muted: '#a7b1bc',
    rule: '#53585d',
    track: '#262a2d',
    heat: ['#41464a', '#405a6e', '#577c99', '#7db5d8', '#afe7fa'],
  },
  light: {
    background: '#ffffff',
    text: '#1f292f',
    muted: '#616e79',
    rule: '#dce2e6',
    track: '#e8edf0',
    heat: ['#edf0f2', '#c3ddec', '#83b7d6', '#3f8dbd', '#17608c'],
  },
};

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function tokenCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid token count: ${label}`);
  }
  return value;
}

function isDateKey(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(date, count) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY_MS)
    .toISOString().slice(0, 10);
}

export function normalizeUsage(stats, history, today = localDate()) {
  if (!isDateKey(today)) throw new Error('Invalid calendar date');
  const allTime = stats?.periods?.allTime;
  const totalTokens = tokenCount(allTime?.totalTokens, 'all-time total');
  if (!allTime.clients || typeof allTime.clients !== 'object'
      || Array.isArray(allTime.clients)) {
    throw new Error('Missing all-time source breakdown');
  }
  const tools = Object.entries(allTime.clients)
    .map(([id, value]) => ({
      id, label: LABELS[id] || id,
      tokens: tokenCount(value, `source ${id}`),
    }))
    .filter((tool) => tool.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens || a.id.localeCompare(b.id));
  if (tools.reduce((sum, tool) => sum + tool.tokens, 0) > totalTokens) {
    throw new Error('Source breakdown exceeds lifetime total');
  }
  if (!Array.isArray(history?.daily)) {
    throw new Error('Daily history is unavailable; keeping the existing card');
  }
  if (totalTokens > 0 && history.daily.length === 0) {
    throw new Error('Daily history is empty; keeping the existing card');
  }

  const start = addDays(today, -364);
  const days = new Map();
  for (const row of history.daily) {
    if (!isDateKey(row.date)) throw new Error('Invalid date in daily history');
    if (days.has(row.date)) throw new Error('Duplicate date in daily history');
    days.set(row.date, tokenCount(row.tokens, `day ${row.date}`));
  }
  // The historical tier updates less often than the live snapshot.
  const liveToday = tokenCount(stats?.periods?.today?.totalTokens, 'today total');
  days.set(today, liveToday);
  const daily = [...days]
    .filter(([date]) => date >= start && date <= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tokens]) => ({ date, tokens }));

  return {
    today, start, totalTokens, tools: tools.slice(0, 4), daily,
    activeDays: daily.filter((day) => day.tokens > 0).length,
  };
}

const number = (value) => value.toLocaleString('en-US');

export function renderCard(usage, theme = 'dark', username = 'CJerryR') {
  const t = THEMES[theme];
  if (!t) throw new Error('Unknown card theme');
  const lines = [];
  const text = (x, y, value, attributes = '') => {
    lines.push(`<text x="${x}" y="${y}" ${attributes}>${escapeXml(value)}</text>`);
  };
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc">`);
  lines.push(`<title id="title">${escapeXml(username)} - Token Monitor</title>`);
  lines.push(`<desc id="desc">${escapeXml(`${number(usage.totalTokens)} lifetime tokens. ${usage.tools.map((tool) => `${tool.label}: ${number(tool.tokens)}`).join('. ')}. ${usage.activeDays} active days in the last 365 days.`)}</desc>`);
  lines.push(`<style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;fill:${t.text};letter-spacing:0}.mono{font-family:Consolas,"Liberation Mono",monospace;font-variant-numeric:tabular-nums}.muted{fill:${t.muted}}</style>`);
  lines.push(`<rect width="${WIDTH}" height="${HEIGHT}" rx="8" fill="${t.background}"/>`);
  text(28, 35, 'TOTAL TOKENS', 'class="mono muted" font-size="13"');
  text(872, 35, `${username} / LIFETIME`, 'class="mono muted" font-size="12" text-anchor="end"');
  const total = number(usage.totalTokens);
  const totalSize = Math.min(66, Math.floor(844 / (total.length * 0.61)));
  text(28, 112, total, `class="mono" font-size="${totalSize}" font-weight="700"`);
  text(30, 140, 'All sources', 'class="muted" font-size="13"');
  const maxTokens = usage.tools[0]?.tokens || 1;
  usage.tools.forEach((tool, index) => {
    const y = 182 + index * 61;
    const color = COLORS[tool.id] || ['#48a9b4', '#d4876b', '#10bea2', '#4b88ee'][index];
    const share = usage.totalTokens > 0 ? tool.tokens / usage.totalTokens * 100 : 0;
    const labelSize = tool.label.length > 28 ? 13 : 17;
    const label = tool.label.length > 38 ? `${tool.label.slice(0, 35)}...` : tool.label;
    lines.push(`<circle cx="35" cy="${y - 6}" r="6" fill="${color}"/>`);
    text(53, y, label, `font-size="${labelSize}" font-weight="600"`);
    text(872, y, `${number(tool.tokens)}  (${share.toFixed(1)}%)`, 'class="mono" font-size="16" text-anchor="end"');
    lines.push(`<rect x="28" y="${y + 15}" width="844" height="8" rx="4" fill="${t.track}"/>`);
    lines.push(`<rect x="28" y="${y + 15}" width="${Math.max(3, 844 * tool.tokens / maxTokens).toFixed(2)}" height="8" rx="4" fill="${color}"/>`);
  });
  lines.push(`<path d="M28 411H872" stroke="${t.rule}"/>`);
  text(28, 443, 'ACTIVITY', 'font-size="15" font-weight="700"');
  text(872, 443, `${usage.activeDays} active days / last 12 months`, 'class="mono muted" font-size="12" text-anchor="end"');

  const startWeekday = new Date(`${usage.start}T00:00:00Z`).getUTCDay();
  const gridStart = addDays(usage.start, -startWeekday);
  const days = new Map(usage.daily.map((day) => [day.date, day.tokens]));
  const maximum = Math.max(1, ...usage.daily.map((day) => day.tokens));
  let previousMonth;
  let lastMonthX = -100;
  for (let index = 0; index < 371; index += 1) {
    const date = addDays(gridStart, index);
    if (date > usage.today) break;
    const column = Math.floor(index / 7);
    const row = index % 7;
    const x = 28 + column * 16;
    const y = 464 + row * 16;
    if (date < usage.start) continue;
    const tokens = days.get(date) || 0;
    const intensity = tokens > 0 ? Math.max(1, Math.ceil(Math.sqrt(tokens / maximum) * 4)) : 0;
    lines.push(`<rect x="${x}" y="${y}" width="12" height="12" rx="2" fill="${t.heat[intensity]}"><title>${date}: ${number(tokens)} tokens</title></rect>`);
    const month = date.slice(0, 7);
    if (month !== previousMonth) {
      // A partial first week can share its column with a month boundary.
      const showFirstPartialMonth = date !== usage.start || Number(date.slice(8)) <= 7;
      if (showFirstPartialMonth && x - lastMonthX >= 36 && x <= 848) {
        const name = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
          .format(new Date(`${date}T00:00:00Z`));
        text(x, 590, name, 'class="muted" font-size="11"');
        lastMonthX = x;
      }
      previousMonth = month;
    }
  }
  text(28, 622, `Token Monitor / ${usage.today} / Asia/Shanghai`, 'class="mono muted" font-size="11"');
  text(748, 622, 'Less', 'class="muted" font-size="10" text-anchor="end"');
  t.heat.forEach((color, index) => {
    lines.push(`<rect x="${756 + index * 16}" y="612" width="12" height="12" rx="2" fill="${color}"/>`);
  });
  text(872, 622, 'More', 'class="muted" font-size="10" text-anchor="end"');
  lines.push('</svg>');
  return `${lines.join('\n')}\n`;
}
