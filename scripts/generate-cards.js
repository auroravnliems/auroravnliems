#!/usr/bin/env node
/*
 * generate-cards.js — builds every image the profile README uses, in a dark and a light variant:
 *
 *   assets/header-{dark,light}.svg   name + rotating role line (pure SVG/CSS, no external service)
 *   assets/stats-{dark,light}.svg    year numbers, streaks and the activity hexagon
 *   assets/langs-{dark,light}.svg    language share across own public repos (forks and archived excluded)
 *
 * One GraphQL request feeds everything. Run by .github/workflows/update-cards.yml.
 *
 *   GITHUB_TOKEN=... node scripts/generate-cards.js [username]
 *   node scripts/generate-cards.js --fixture data.json     # render from a saved GraphQL response (offline preview)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const fixtureAt = args.indexOf('--fixture');
const FIXTURE = fixtureAt >= 0 ? args[fixtureAt + 1] : null;
const USERNAME =
  args.find((a, i) => !a.startsWith('--') && i !== fixtureAt + 1) ||
  (process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[0] : 'auroravnliems');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const OUT = path.resolve(__dirname, '..', 'assets');

// ---------------------------------------------------------------- theme
// Language colours are assigned by rank and were checked for colour-blind separation and
// contrast against each card background (dataviz validate_palette, both modes pass).
const THEMES = {
  dark: {
    bg: '#0f0b1e', border: '#2c2150', grid: '#3a2d63', text: '#f3ecff', muted: '#a99cc8',
    accent: '#ff3ea5', accent2: '#00d9f5', fill: 'rgba(255,62,165,0.20)',
    langs: ['#f0338f', '#00a3c4', '#b88600', '#a05cf0', '#1fae78', '#e0601f'], other: '#6a5a88',
  },
  light: {
    bg: '#ffffff', border: '#ecdcea', grid: '#ead7e6', text: '#2b2140', muted: '#6f6284',
    accent: '#d63c88', accent2: '#1f8fb4', fill: 'rgba(214,60,136,0.14)',
    langs: ['#df4d94', '#2a9cc0', '#c7800a', '#8554c5', '#3f9e6e', '#e0663f'], other: '#b3a4b9',
  },
};
const FONT = "-apple-system, 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Consolas, monospace";

const ROLES = [
  'Minecraft plugin developer',
  'Author of TachyonScript',
  'Java · Kotlin · Paper API',
  'Server infrastructure & DevOps',
  'Plugin security & obfuscation',
];

// ---------------------------------------------------------------- data
const QUERY = `query($login: String!) {
  user(login: $login) {
    login name
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions totalPullRequestContributions totalIssueContributions
      totalPullRequestReviewContributions restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes {
        name stargazerCount isArchived
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
      }
    }
  }
}`;

async function load() {
  if (FIXTURE) return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  if (!TOKEN) throw new Error('GITHUB_TOKEN is required (or pass --fixture <file>)');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-cards' },
    body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`GraphQL: ${res.status} ${JSON.stringify(body.errors || body)}`);
  return body;
}

function summarize(raw) {
  const u = raw.data.user;
  const cc = u.contributionsCollection;
  const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // current streak: today may still be empty, so it counts back from yesterday in that case (like GitHub)
  let current = 0;
  let i = days.length - 1;
  if (i >= 0 && days[i].contributionCount === 0) i--;
  for (; i >= 0 && days[i].contributionCount > 0; i--) current++;

  const repos = u.repositories.nodes.filter((r) => !r.isArchived);
  const langs = {};
  for (const r of repos) for (const e of r.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;

  return {
    login: u.login,
    total: cc.contributionCalendar.totalContributions,
    activeDays: days.filter((d) => d.contributionCount > 0).length,
    current,
    longest,
    commits: cc.totalCommitContributions + cc.restrictedContributionsCount,
    prs: cc.totalPullRequestContributions,
    issues: cc.totalIssueContributions,
    reviews: cc.totalPullRequestReviewContributions,
    repos: u.repositories.totalCount,
    stars: u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
    followers: u.followers.totalCount,
    langs: Object.entries(langs).sort((a, b) => b[1] - a[1]),
  };
}

// ---------------------------------------------------------------- svg helpers
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = (n) => Number(n).toLocaleString('en-US');
const svg = (w, h, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t">\n` +
  `<title id="t">${esc(title)}</title>\n${body}\n</svg>\n`;
const frame = (w, h, t) =>
  `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>`;

// ---------------------------------------------------------------- header
function header(t, mode) {
  const W = 860;
  const H = 170;
  const step = 3; // seconds per role
  const cycle = ROLES.length * step;
  const share = (100 / ROLES.length).toFixed(3);
  const roles = ROLES.map(
    (r, i) => `<text class="role" x="${W / 2}" y="122" text-anchor="middle" style="animation-delay:${i * step}s">${esc(r)}</text>`,
  ).join('\n  ');
  // a handful of fixed "stars" — deterministic positions so the file only changes when content does
  const stars = [
    [64, 38, 1.6], [132, 120, 1.1], [210, 52, 1.3], [702, 40, 1.5], [780, 118, 1.2], [612, 140, 1], [300, 146, 1], [520, 30, 1.2],
  ]
    .map(([x, y, r], i) => `<circle class="star" cx="${x}" cy="${y}" r="${r}" style="animation-delay:${(i * 0.7).toFixed(1)}s"/>`)
    .join('');
  return svg(
    W,
    H,
    'Aurora_VN — Minecraft plugin developer',
    `<defs>
  <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient>
</defs>
<style>
  .name { font: 800 46px ${FONT}; fill: url(#g); letter-spacing: 0.5px; }
  .hi { font: 600 15px ${MONO}; fill: ${t.muted}; letter-spacing: 3px; }
  .role { font: 600 20px ${MONO}; fill: ${t.text}; opacity: 0; animation: role ${cycle}s infinite; }
  .star { fill: ${mode === 'dark' ? '#ffffff' : t.accent}; opacity: 0.35; animation: tw 3.2s ease-in-out infinite; }
  @keyframes role {
    0% { opacity: 0; transform: translateY(6px); }
    ${(share * 0.12).toFixed(3)}% { opacity: 1; transform: none; }
    ${(share * 0.88).toFixed(3)}% { opacity: 1; transform: none; }
    ${share}%, 100% { opacity: 0; transform: translateY(-6px); }
  }
  @keyframes tw { 50% { opacity: 0.9; } }
  @media (prefers-reduced-motion: reduce) { .role, .star { animation: none; } .role:first-of-type { opacity: 1; } }
</style>
${frame(W, H, t)}
${stars}
<text class="hi" x="${W / 2}" y="44" text-anchor="middle">HI, I'M</text>
<text class="name" x="${W / 2}" y="92" text-anchor="middle">Aurora_VN</text>
<rect x="${W / 2 - 60}" y="102" width="120" height="3" rx="1.5" fill="url(#g)"/>
<g>
  ${roles}
</g>`,
  );
}

// ---------------------------------------------------------------- stats + hexagon
const AXES = [
  { key: 'commits', label: 'Commits', full: 1000 },
  { key: 'prs', label: 'Pull requests', full: 100 },
  { key: 'issues', label: 'Issues', full: 100 },
  { key: 'reviews', label: 'Reviews', full: 100 },
  { key: 'stars', label: 'Stars', full: 100 },
  { key: 'repos', label: 'Repos', full: 50 },
];

function stats(s, t) {
  const W = 860;
  const H = 300;
  const tiles = [
    { v: s.total, l: 'contributions · last 12 months', big: true },
    { v: s.current, l: 'current streak (days)' },
    { v: s.longest, l: 'longest streak (days)' },
    { v: s.activeDays, l: 'active days' },
    { v: s.repos, l: 'public repos' },
    { v: s.stars, l: 'stars earned' },
    { v: s.followers, l: 'followers' },
  ];
  // left: 1 big tile + 2 columns x 3 rows
  const tx = 28;
  const parts = [];
  parts.push(`<text class="h" x="${tx}" y="44">GitHub activity</text>`);
  parts.push(`<text class="sub" x="${tx}" y="64">@${esc(s.login)} · updated daily</text>`);
  const big = tiles[0];
  parts.push(`<rect x="${tx}" y="84" width="404" height="62" rx="10" fill="${t.fill}" stroke="${t.accent}" stroke-opacity="0.55"/>`);
  parts.push(`<text class="bigv" x="${tx + 18}" y="126">${nf(big.v)}</text>`);
  parts.push(`<text class="lab" x="${tx + 18 + String(nf(big.v)).length * 21 + 14}" y="122">${esc(big.l)}</text>`);
  tiles.slice(1).forEach((tile, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = tx + col * 206;
    const y = 158 + row * 44;
    parts.push(`<rect x="${x}" y="${y}" width="198" height="36" rx="8" fill="none" stroke="${t.border}"/>`);
    parts.push(`<text class="v" x="${x + 12}" y="${y + 24}">${nf(tile.v)}</text>`);
    parts.push(`<text class="lab" x="${x + 12 + String(nf(tile.v)).length * 11 + 10}" y="${y + 23}">${esc(tile.l)}</text>`);
  });

  // right: hexagon, log scale per axis against a "full" mark
  const cx = 646;
  const cy = 158;
  const R = 92;
  const pt = (i, r) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const poly = (r) => AXES.map((_, i) => pt(i, r).map((n) => n.toFixed(1)).join(',')).join(' ');
  const hex = [];
  for (const f of [0.25, 0.5, 0.75, 1]) hex.push(`<polygon points="${poly(R * f)}" fill="none" stroke="${t.grid}" stroke-width="1"/>`);
  AXES.forEach((_, i) => {
    const [x, y] = pt(i, R);
    hex.push(`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${t.grid}" stroke-width="1"/>`);
  });
  const shape = AXES.map((ax, i) => {
    const v = s[ax.key] || 0;
    const score = Math.min(1, Math.log1p(v) / Math.log1p(ax.full));
    return pt(i, R * Math.max(score, 0.04));
  });
  hex.push(
    `<polygon class="shape" points="${shape.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="${t.fill}" stroke="${t.accent}" stroke-width="2" stroke-linejoin="round"/>`,
  );
  shape.forEach(([x, y]) => hex.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${t.accent2}" stroke="${t.bg}" stroke-width="1.5"/>`));
  AXES.forEach((ax, i) => {
    const [x, y] = pt(i, R + 16);
    const anchor = Math.abs(x - cx) < 1 ? 'middle' : x > cx ? 'start' : 'end';
    const dy = i === 0 ? -12 : i === 3 ? 18 : 2;
    hex.push(
      `<text class="ax" x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}"><tspan class="axv">${nf(s[ax.key] || 0)}</tspan> ${esc(ax.label)}</text>`,
    );
  });

  return svg(
    W,
    H,
    `GitHub activity of ${s.login}: ${s.total} contributions in the last year`,
    `<style>
  .h { font: 700 20px ${FONT}; fill: ${t.text}; }
  .sub { font: 400 13px ${FONT}; fill: ${t.muted}; }
  .bigv { font: 800 36px ${MONO}; fill: ${t.accent}; }
  .v { font: 700 18px ${MONO}; fill: ${t.text}; }
  .lab { font: 400 13px ${FONT}; fill: ${t.muted}; }
  .ax { font: 400 12px ${FONT}; fill: ${t.muted}; }
  .axv { font: 700 13px ${MONO}; fill: ${t.text}; }
  .note { font: 400 11px ${FONT}; fill: ${t.muted}; }
  .shape { transform-origin: ${cx}px ${cy}px; animation: grow 1.1s cubic-bezier(.3,1.4,.5,1) both; }
  @keyframes grow { from { transform: scale(0); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .shape { animation: none; } }
</style>
${frame(W, H, t)}
${parts.join('\n')}
<line x1="458" y1="30" x2="458" y2="${H - 30}" stroke="${t.border}"/>
${hex.join('\n')}
<text class="note" x="${W - 24}" y="${H - 14}" text-anchor="end">last 12 months · log scale</text>`,
  );
}

// ---------------------------------------------------------------- languages
function languages(s, t) {
  const W = 860;
  const TOP = 6;
  const total = s.langs.reduce((a, l) => a + l[1], 0) || 1;
  const rows = s.langs.slice(0, TOP).map(([name, size], i) => ({ name, size, color: t.langs[i] }));
  const rest = s.langs.slice(TOP).reduce((a, l) => a + l[1], 0);
  if (rest) rows.push({ name: 'Other', size: rest, color: t.other });
  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;

  const cols = 4;
  const lines = Math.ceil(rows.length / cols);
  const H = 128 + lines * 30;
  const barX = 28;
  const barW = W - 56;
  const gap = 2;
  const parts = [`<clipPath id="bar"><rect x="${barX}" y="76" width="${barW}" height="14" rx="7"/></clipPath>`, '<g clip-path="url(#bar)">'];
  let x = barX;
  const usable = barW - gap * (rows.length - 1);
  rows.forEach((r, i) => {
    const w = Math.max(3, (r.size / total) * usable);
    parts.push(`<rect class="seg" x="${x.toFixed(2)}" y="76" width="${w.toFixed(2)}" height="14" fill="${r.color}" style="animation-delay:${(0.15 + i * 0.08).toFixed(2)}s"><title>${esc(r.name)} ${pct(r.size)}</title></rect>`);
    x += w + gap;
  });
  parts.push('</g>');
  rows.forEach((r, i) => {
    const cx = barX + (i % cols) * (barW / cols);
    const cy = 124 + Math.floor(i / cols) * 30;
    parts.push(`<rect x="${cx}" y="${cy - 11}" width="12" height="12" rx="3" fill="${r.color}"/>`);
    parts.push(`<text class="ln" x="${cx + 20}" y="${cy}">${esc(r.name)}</text>`);
    parts.push(`<text class="lp" x="${cx + barW / cols - 24}" y="${cy}" text-anchor="end">${pct(r.size)}</text>`);
  });

  return svg(
    W,
    H,
    `Most used languages: ${rows.map((r) => `${r.name} ${pct(r.size)}`).join(', ')}`,
    `<style>
  .h { font: 700 20px ${FONT}; fill: ${t.text}; }
  .sub { font: 400 13px ${FONT}; fill: ${t.muted}; }
  .ln { font: 600 14px ${FONT}; fill: ${t.text}; }
  .lp { font: 400 13px ${MONO}; fill: ${t.muted}; }
  .seg { transform-box: fill-box; transform-origin: left; animation: grow .8s cubic-bezier(.3,1.2,.5,1) both; }
  @keyframes grow { from { transform: scaleX(0); } }
  @media (prefers-reduced-motion: reduce) { .seg { animation: none; } }
</style>
${frame(W, H, t)}
<text class="h" x="28" y="44">Most used languages</text>
<text class="sub" x="28" y="64">by code size across own public repos · forks and archived excluded</text>
${parts.join('\n')}`,
  );
}

// ---------------------------------------------------------------- main
(async () => {
  try {
    const s = summarize(await load());
    fs.mkdirSync(OUT, { recursive: true });
    for (const [mode, t] of Object.entries(THEMES)) {
      fs.writeFileSync(path.join(OUT, `header-${mode}.svg`), header(t, mode));
      fs.writeFileSync(path.join(OUT, `stats-${mode}.svg`), stats(s, t));
      fs.writeFileSync(path.join(OUT, `langs-${mode}.svg`), languages(s, t));
    }
    console.log(`cards written for ${s.login}: ${s.total} contributions, ${s.langs.length} languages, ${s.repos} repos`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
