#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  parseTrailerFromBody,
  writeTextUtf8,
} = require('./core.cjs');

const ROOT = path.resolve(__dirname);
const REPORTS_DIR = path.join(ROOT, 'reports');

function parseArgs(argv) {
  const opts = { since: '7 days ago', json: false, md: false, byAuthor: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--since' && argv[i + 1]) {
      const v = argv[++i];
      opts.since = /^\d+d$/.test(v) ? `${v.slice(0, -1)} days ago` : v;
    } else if (argv[i] === '--until' && argv[i + 1]) {
      opts.until = argv[++i];
    } else if (argv[i] === '--json') opts.json = true;
    else if (argv[i] === '--md') opts.md = true;
    else if (argv[i] === '--by-author') opts.byAuthor = true;
  }
  return opts;
}

/** Build git-log argv (without leading `git`). Exported for tests (AC-U1/U2). */
function buildGitLogArgs(since, until) {
  const fmt = '%H%x09%P%x09%s%x09%ae%x09%ad%x09%b%x1e';
  const args = ['log', `--since=${since}`, `--format=${fmt}`, '--date=short'];
  if (until) args.splice(1, 0, `--until=${until}`);
  return args;
}

function isBotEmail(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return false;
  if (e.includes('[bot]') && e.includes('noreply.github.com')) return true;
  if (e.startsWith('github-actions@')) return true;
  if (e.startsWith('dependabot@')) return true;
  return false;
}

/** Merge / bot hardcodes only — path exclude is applied at collect/attribute time. */
function shouldExcludeCommit(meta) {
  if (meta.isMerge) return true;
  if (isBotEmail(meta.email)) return true;
  return false;
}

function gitLogSince(since, until) {
  const out = execFileSync('git', buildGitLogArgs(since, until), {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C.UTF-8' },
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  return out
    .split('\x1e')
    .map((chunk) => chunk.replace(/^\n+/, '').trimEnd())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split('\x09');
      const hash = parts[0] || '';
      const parents = parts[1] ?? '';
      const subject = parts[2] || '';
      const email = parts[3] || '';
      const date = parts[4] || '';
      const body = parts.slice(5).join('\x09');
      const full = subject + '\n' + body;
      const trailer = parseTrailerFromBody(full);
      return {
        hash,
        subject,
        email,
        date,
        isMerge: parents.includes(' '),
        trailer,
      };
    })
    .filter((c) => /^[0-9a-f]{40}$/i.test(c.hash));
}

function aggregate(commits) {
  let valid = 0;
  let yesCount = 0;
  let unknownCount = 0;
  let totalLines = 0;
  let aiLines = 0;
  const byAuthor = new Map();
  const byDate = new Map();

  for (const c of commits) {
    const t = c.trailer;
    if (!t.hasTrailer) continue;
    valid++;
    if (t.authored === 'yes') yesCount++;
    if (t.authored === 'unknown') unknownCount++;
    const lines = t.lines || 0;
    const ai = (t.aiAdded || 0) + (t.aiDeleted || 0);
    totalLines += lines;
    aiLines += ai;

    const authorKey = c.email || 'unknown';
    if (!byAuthor.has(authorKey)) {
      byAuthor.set(authorKey, { commits: 0, yes: 0, lines: 0, aiLines: 0 });
    }
    const au = byAuthor.get(authorKey);
    au.commits++;
    if (t.authored === 'yes') au.yes++;
    au.lines += lines;
    au.aiLines += ai;

    const dk = c.date || 'unknown';
    if (!byDate.has(dk)) byDate.set(dk, { commits: 0, yes: 0, lines: 0, aiLines: 0 });
    const du = byDate.get(dk);
    du.commits++;
    if (t.authored === 'yes') du.yes++;
    du.lines += lines;
    du.aiLines += ai;
  }

  const m1 = valid ? yesCount / valid : 0;
  const m2 = totalLines ? aiLines / totalLines : 0;
  const leak = valid ? unknownCount / valid : 0;

  return {
    valid,
    yesCount,
    unknownCount,
    totalLines,
    aiLines,
    humanLines: totalLines - aiLines,
    m1,
    m2,
    m2Prime: m2,
    leak,
    byAuthor,
    byDate,
  };
}

function formatTable(summary) {
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  return [
    'AI 代码率统计',
    '============',
    `有效提交数: ${summary.valid}`,
    `AI 提交率: ${pct(summary.m1)} (${summary.yesCount}/${summary.valid})`,
    `AI 行占比: ${pct(summary.m2)} (${summary.aiLines}/${summary.totalLines} 行)`,
    `人工行数: ${summary.humanLines}`,
    `漏标率: ${pct(summary.leak)} (${summary.unknownCount}/${summary.valid})`,
  ].join('\n');
}

function authorRows(byAuthor) {
  return [...byAuthor.entries()]
    .map(([email, s]) => ({
      email,
      valid: s.commits,
      aiSubmitRate: s.commits ? s.yes / s.commits : 0,
      aiLineRate: s.lines ? s.aiLines / s.lines : 0,
      humanLines: s.lines - s.aiLines,
      yes: s.yes,
      lines: s.lines,
      aiLines: s.aiLines,
    }))
    .sort((a, b) => b.valid - a.valid);
}

function formatByAuthor(summary) {
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  const rows = authorRows(summary.byAuthor);
  if (!rows.length) return '按提交人汇总\n============\n（无数据）';

  const lines = ['按提交人汇总', '============', ''];
  for (const r of rows) {
    lines.push(
      r.email,
      `  有效提交数: ${r.valid}`,
      `  AI 提交率: ${pct(r.aiSubmitRate)} (${r.yes}/${r.valid})`,
      `  AI 行占比: ${pct(r.aiLineRate)} (${r.aiLines}/${r.lines} 行)`,
      `  人工行数: ${r.humanLines}`,
      ''
    );
  }
  return lines.join('\n').trimEnd();
}

function buildJsonPayload(summary, since, until) {
  const payload = {
    since,
    ...summary,
    byAuthor: Object.fromEntries(summary.byAuthor || new Map()),
    byDate: Object.fromEntries(summary.byDate || new Map()),
  };
  if (until) payload.until = until;
  return payload;
}

function formatMarkdown(summary, since, until) {
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  const rangeText = until ? `${since} ~ ${until}` : `${since} 至今`;
  const lines = [
    `# AI 代码率统计报告`,
    ``,
    `- 统计范围: ${rangeText}`,
    `- 生成日期: ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `## 汇总`,
    ``,
    `| 指标 | 数值 |`,
    `|------|------|`,
    `| 有效提交数 | ${summary.valid} |`,
    `| AI 提交率 | ${pct(summary.m1)} (${summary.yesCount}/${summary.valid}) |`,
    `| AI 行占比 | ${pct(summary.m2)} (${summary.aiLines}/${summary.totalLines} 行) |`,
    `| 人工行数 | ${summary.humanLines} |`,
    `| 漏标率 | ${pct(summary.leak)} (${summary.unknownCount}/${summary.valid}) |`,
  ];

  const rows = authorRows(summary.byAuthor);
  if (rows.length) {
    lines.push(
      ``,
      `## 按提交人`,
      ``,
      `| 提交人 | 有效提交数 | AI 提交率 | AI 行占比 | 人工行数 |`,
      `|--------|------------|-----------|-----------|----------|`
    );
    for (const r of rows) {
      lines.push(
        `| ${r.email} | ${r.valid} | ${pct(r.aiSubmitRate)} (${r.yes}/${r.valid}) | ${pct(r.aiLineRate)} (${r.aiLines}/${r.lines} 行) | ${r.humanLines} |`
      );
    }
  }
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv);
  const raw = gitLogSince(opts.since, opts.until);
  const commits = raw.filter((c) => !shouldExcludeCommit(c));
  const summary = aggregate(commits);

  if (opts.json) {
    console.log(JSON.stringify(buildJsonPayload(summary, opts.since, opts.until), null, 2));
    return;
  }

  if (opts.md) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const fp = path.join(REPORTS_DIR, `${day}.md`);
    writeTextUtf8(fp, formatMarkdown(summary, opts.since, opts.until));
    console.log(`Report written: ${fp}`);
    return;
  }

  const parts = [formatTable(summary)];
  if (opts.byAuthor) parts.push('', formatByAuthor(summary));
  console.log(parts.join('\n'));
}

module.exports = {
  parseArgs,
  buildGitLogArgs,
  buildJsonPayload,
  formatMarkdown,
  gitLogSince,
  shouldExcludeCommit,
  main,
};

if (require.main === module) main();
