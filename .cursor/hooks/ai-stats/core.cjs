'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname);
const TRACE_DIR = path.join(ROOT, 'trace');

let _traceOverride = null;
let _repoRootOverride = null;
let _execGitForTest = null;
let _excludePathsOverride = null;

/** mtime 消歧：top1 与 top2 差值小于此值视为歧义，不写 trace */
const MTIME_TIE_BREAK_MS = 500;

// ---------------------------------------------------------------------------
// § encoding
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (dir && dir !== '.') {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function localISOString(date) {
  const d = date || new Date();
  const pad = (n, len) => String(n).padStart(len || 2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    pad(d.getFullYear(), 4) + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + 'T' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes()) + ':' +
    pad(d.getSeconds()) + '.' +
    pad(d.getMilliseconds(), 3) +
    sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60)
  );
}

function stripBom(text) {
  return String(text).replace(/^\uFEFF/, '');
}

function readTextUtf8(fp) {
  return stripBom(fs.readFileSync(fp, 'utf8'));
}

function writeTextUtf8(fp, text) {
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, text, { encoding: 'utf8' });
}

function execGit(args, repoRoot) {
  if (_execGitForTest) return _execGitForTest(args, repoRoot);
  const cwd = repoRoot || _repoRootOverride || resolveRepoRoot([]) || undefined;
  return execSync(`git ${args}`, {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C.UTF-8' },
    ...(cwd ? { cwd } : {}),
  });
}

function setExecGitForTest(fn) {
  _execGitForTest = fn;
}

// ---------------------------------------------------------------------------
// § hash + normalizeLine
// ---------------------------------------------------------------------------

function normalizeLine(line) {
  if (line == null) return '';
  return String(line).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+$/, '');
}

function hashLine(line) {
  const normalized = normalizeLine(line);
  if (normalized === '') return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** 与 hashLine 一致：空行/纯空白不计入 Lines 与 AI 行统计 */
function isCountableLine(line) {
  return normalizeLine(line) !== '';
}

// ---------------------------------------------------------------------------
// § diffLineOps (LCS)
// ---------------------------------------------------------------------------

function diffLineOps(oldLines, newLines) {
  const a = oldLines.map(normalizeLine);
  const b = newLines.map(normalizeLine);
  const n = a.length;
  const m = b.length;

  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const stack = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ op: 'add', line: newLines[j - 1] });
      j--;
    } else {
      stack.push({ op: 'del', line: oldLines[i - 1] });
      i--;
    }
  }
  return stack.reverse();
}

function linesFromDiffOps(ops) {
  return ops
    .map(({ op, line }) => {
      const h = hashLine(line);
      return h ? { op, hash: h } : null;
    })
    .filter(Boolean);
}

function collectFromFileDiff(oldText, newText) {
  const oldLines = String(oldText ?? '').split('\n');
  const newLines = String(newText ?? '').split('\n');
  return linesFromDiffOps(diffLineOps(oldLines, newLines));
}

// ---------------------------------------------------------------------------
// § path exclude
// ---------------------------------------------------------------------------

function setExcludePathsForTest(rules) {
  _excludePathsOverride = rules;
}

function normalizeExcludeRel(raw) {
  return String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function parseExcludePathsCsv(raw) {
  if (raw == null || raw === '') return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadPathExclude() {
  if (_excludePathsOverride != null) return _excludePathsOverride;
  const fp = path.join(ROOT, 'ai-stats.exclude.json');
  if (!fs.existsSync(fp)) return [];
  try {
    const data = JSON.parse(readTextUtf8(fp));
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'excludePaths')) return [];
    return parseExcludePathsCsv(data.excludePaths);
  } catch {
    return [];
  }
}

/** Convert a path glob to RegExp: `*`/`?` do not cross `/`; `**` may. */
function excludeGlobToRegExp(pattern) {
  let i = 0;
  let out = '^';
  const p = String(pattern);
  while (i < p.length) {
    if (p[i] === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 3;
      } else {
        out += '.*';
        i += 2;
      }
      continue;
    }
    if (p[i] === '*') {
      out += '[^/]*';
      i++;
      continue;
    }
    if (p[i] === '?') {
      out += '[^/]';
      i++;
      continue;
    }
    if (/[.+^${}()|[\]\\]/.test(p[i])) out += '\\' + p[i];
    else out += p[i];
    i++;
  }
  out += '$';
  return new RegExp(out);
}

function matchExcludeRule(rel, ruleRaw) {
  const ruleSlash = String(ruleRaw || '').trim().replace(/\\/g, '/');
  if (!ruleSlash) return false;
  const normalized = normalizeExcludeRel(rel);

  // Suffix: configured entry starts with `.` and has no `/` (e.g. `.map`).
  // Do not strip a leading `/` first — `/.cursor` is a directory prefix, not a suffix.
  if (ruleSlash.startsWith('.') && !ruleSlash.includes('/')) {
    const base = normalized.split('/').pop() || '';
    return base.toLowerCase().endsWith(ruleSlash.toLowerCase());
  }

  const rule = ruleSlash.replace(/^\/+/, '');
  if (!rule) return false;

  // Glob: contains * or ?
  if (rule.includes('*') || rule.includes('?')) {
    return excludeGlobToRegExp(rule).test(normalized);
  }

  // Directory prefix
  return normalized === rule || normalized.startsWith(rule + '/');
}

function shouldExcludeRelPath(rel, rules) {
  const list = rules != null ? rules : loadPathExclude();
  if (!list.length) return false;
  for (const rule of list) {
    if (matchExcludeRule(rel, rule)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// § path helpers
// ---------------------------------------------------------------------------

function findRepoRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function setRepoRootForTest(dir) {
  _repoRootOverride = dir;
}

/** Prefer workspace_roots, then on-disk paths, then process.cwd(). */
function resolveRepoRoot(roots, ...absHints) {
  if (_repoRootOverride) return _repoRootOverride;
  const hints = [];
  for (const r of roots || []) {
    if (r) hints.push(normalizeWorkspaceRoot(r));
  }
  for (const abs of absHints) {
    if (!abs) continue;
    hints.push(path.dirname(path.resolve(abs)));
    hints.push(path.resolve(abs));
  }
  hints.push(process.cwd());
  for (const h of hints) {
    const root = findRepoRoot(h);
    if (root) return root;
  }
  return null;
}

function toCanonicalRelPath(absPath, repoRoot) {
  if (!absPath || !repoRoot) return null;
  const rel = path.relative(repoRoot, path.resolve(absPath)).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel;
}

function finalizeResolved(abs, garbledFile, roots) {
  if (abs && fs.existsSync(abs)) {
    const repoRoot = resolveRepoRoot(roots, abs);
    const canonical = toCanonicalRelPath(abs, repoRoot);
    if (canonical) return { abs: path.resolve(abs), file: canonical };
  }
  return { abs: abs || null, file: garbledFile };
}

function guessPathExt(filePath) {
  const seg = String(filePath || '').split('/').pop() || '';
  const ext = path.extname(seg);
  if (/^\.[a-zA-Z0-9]{1,9}$/.test(ext)) return ext;
  const lower = seg.toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('txt')) return '.txt';
  if (lower.endsWith('.md') || lower.endsWith('md')) return '.md';
  if (lower.endsWith('.sql') || lower.endsWith('sql')) return '.sql';
  if (lower.endsWith('.cjs') || lower.endsWith('cjs')) return '.cjs';
  if (lower.endsWith('.js') || lower.endsWith('js')) return '.js';
  if (lower.endsWith('.java')) return '.java';
  if (lower.endsWith('.vue')) return '.vue';
  return ext;
}

/** Git status --porcelain -z：NUL 分隔，非 ASCII 路径无引号包裹 */
function parsePorcelainZPaths(zOutput, ext) {
  const out = [];
  const seen = new Set();
  for (const entry of String(zOutput || '').split('\0')) {
    if (!entry || entry.length < 3) continue;
    const tag = entry.slice(0, 2);
    if (tag === '!!') continue;
    const rel = entry.slice(3);
    if (!rel) continue;
    const normalized = normalizeGitPath(rel);
    if (!normalized || seen.has(normalized)) continue;
    if (ext && !normalized.endsWith(ext)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function gitModifiedRelPaths(repoRoot, gitRelDir, ext) {
  if (!repoRoot || gitRelDir == null || gitRelDir === '') return [];
  try {
    const zOut = execGit(`status --porcelain -z -- "${gitRelDir}"`, repoRoot);
    return parsePorcelainZPaths(zOut, ext);
  } catch {
    return [];
  }
}

function collectEditAnchors(edits) {
  const anchors = [];
  for (const edit of edits || []) {
    const oldStr = edit?.old_string;
    if (oldStr != null && oldStr !== '') anchors.push(String(oldStr));
  }
  return anchors;
}

function pickByEditContent(candidateRels, anchors, repoRoot) {
  if (!anchors.length || !candidateRels.length) return null;
  const hits = [];
  for (const rel of candidateRels) {
    const full = path.join(repoRoot, ...rel.split('/'));
    if (!fs.existsSync(full)) continue;
    let content;
    try {
      content = readTextUtf8(full);
    } catch {
      continue;
    }
    if (anchors.some((a) => content.includes(a))) hits.push(rel);
  }
  return hits.length === 1 ? hits[0] : null;
}

function pickByMtime(candidateRels, repoRoot) {
  if (!candidateRels.length) return null;
  if (candidateRels.length === 1) return candidateRels[0];
  const ranked = candidateRels
    .map((rel) => {
      const full = path.join(repoRoot, ...rel.split('/'));
      return {
        rel,
        mtime: fs.existsSync(full) ? fs.statSync(full).mtimeMs : 0,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (ranked.length >= 2 && ranked[0].mtime - ranked[1].mtime < MTIME_TIE_BREAK_MS) {
    return null;
  }
  return ranked[0].rel;
}

/**
 * Resolve hook file identity: path hints are untrusted; Git/content/disk are sources of truth.
 * Returns null when ambiguous (宁漏勿滥).
 */
function resolveFileIdentity({ rawFile, fileHint, roots, edits }) {
  const rootHints = roots || [];
  const repoRoot = resolveRepoRoot(rootHints);
  const hint = fileHint || '';

  const absCandidates = [];
  if (repoRoot && hint.includes('/')) {
    absCandidates.push(path.join(repoRoot, ...hint.split('/')));
  }
  if (rawFile) {
    const fromRaw = resolveAbsPath(rawFile, rootHints);
    if (fromRaw) absCandidates.push(fromRaw);
  }

  const direct = absCandidates.find((c) => c && fs.existsSync(c));
  if (direct) {
    return finalizeResolved(direct, hint, rootHints);
  }

  let parentDir = null;
  let absHint = null;
  for (const c of absCandidates) {
    if (!c) continue;
    const dir = path.dirname(c);
    if (fs.existsSync(dir)) {
      parentDir = dir;
      absHint = c;
      break;
    }
  }
  if (!parentDir) return null;

  const ext = guessPathExt(absHint || hint || '');
  const effectiveRepoRoot = repoRoot || resolveRepoRoot(rootHints, parentDir);
  const gitRelDir =
    effectiveRepoRoot && !path.relative(effectiveRepoRoot, parentDir).startsWith('..')
      ? path.relative(effectiveRepoRoot, parentDir).replace(/\\/g, '/')
      : null;

  const modified = gitRelDir ? gitModifiedRelPaths(effectiveRepoRoot, gitRelDir, ext) : [];
  const editList = Array.isArray(edits) ? edits : edits?.edits || [];
  const anchors = collectEditAnchors(editList);

  let pickedRel = null;
  if (modified.length === 1) {
    pickedRel = modified[0];
  } else if (modified.length > 1) {
    pickedRel = pickByEditContent(modified, anchors, effectiveRepoRoot);
    if (!pickedRel) {
      pickedRel = pickByMtime(modified, effectiveRepoRoot);
    }
  } else if (anchors.length && gitRelDir) {
    const scanRels = fs
      .readdirSync(parentDir)
      .filter((name) => !ext || name.endsWith(ext))
      .map((name) => `${gitRelDir}/${name}`.replace(/\\/g, '/'));
    pickedRel = pickByEditContent(scanRels, anchors, effectiveRepoRoot);
  }

  if (!pickedRel) {
    const entries = fs
      .readdirSync(parentDir)
      .filter((name) => !ext || name.endsWith(ext))
      .map((name) => path.join(parentDir, name))
      .filter((full) => fs.existsSync(full));
    if (entries.length === 1) {
      return finalizeResolved(entries[0], hint, rootHints);
    }
    return null;
  }

  const pickedAbs = path.join(effectiveRepoRoot, ...pickedRel.split('/'));
  if (fs.existsSync(pickedAbs)) {
    return finalizeResolved(pickedAbs, pickedRel, rootHints);
  }
  return null;
}

function normalizeWorkspaceRoot(raw) {
  let r = String(raw);
  r = r.replace(/^\/([a-zA-Z]):\//, '$1:/');
  return path.resolve(r);
}

function relPath(raw, roots) {
  const abs = path.resolve(String(raw));
  for (const root of roots) {
    const resolvedRoot = normalizeWorkspaceRoot(root);
    const rel = path.relative(resolvedRoot, abs);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.replace(/\\/g, '/');
    }
  }

  // Fallback: try git repo root (handles garbled path from afterFileEdit)
  const repoRoot = resolveRepoRoot(roots);
  if (repoRoot) {
    const rel = path.relative(repoRoot, abs);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.replace(/\\/g, '/');
    }
  }

  // Final fallback: extract repo-relative path by matching repo name in absolute path
  // Works even when Chinese directory names are garbled (Cursor afterFileEdit bug)
  if (repoRoot) {
    const repoName = path.basename(repoRoot);
    const idx = abs.indexOf(repoName);
    if (idx >= 0) {
      const afterRepo = abs.substring(idx + repoName.length);
      const clean = afterRepo.replace(/^[\\/]+/, '').replace(/\\/g, '/');
      if (clean) return clean;
    }
  }

  return abs.replace(/\\/g, '/');
}

function readGitHeadFile(relFile) {
  try {
    const gitPath = String(relFile).replace(/\\/g, '/');
    return execGit(`show HEAD:${gitPath}`);
  } catch {
    return null;
  }
}

function readBaselineForPostEdit(file) {
  const snap = readSnapshot(file);
  if (snap != null) return snap;
  const head = readGitHeadFile(file);
  if (head != null) return head;
  return '';
}

function resolveAbsPath(raw, roots) {
  if (!raw) return null;
  const str = String(raw);
  if (path.isAbsolute(str)) return path.resolve(str);
  const resolved = path.resolve(str);
  if (fs.existsSync(resolved)) return resolved;
  for (const root of roots) {
    const candidate = path.resolve(normalizeWorkspaceRoot(root), str);
    if (fs.existsSync(candidate)) return candidate;
  }
  const fallbackRoot = roots[0] ? normalizeWorkspaceRoot(roots[0]) : process.cwd();
  return path.resolve(fallbackRoot, str);
}

/** Prefer tool_input path that resolves to an existing file (handles garbled absolute paths). */
function pickToolInputPath(toolInput, roots) {
  const candidates = ['path', 'file_path', 'target_file']
    .map((key) => toolInput[key])
    .filter(Boolean);
  const repoRoot = resolveRepoRoot(roots);
  for (const raw of candidates) {
    const rel = relPath(raw, roots);
    if (repoRoot && rel.includes('/')) {
      const abs = path.join(repoRoot, ...rel.split('/'));
      if (fs.existsSync(abs)) return raw;
    }
    const abs = resolveAbsPath(raw, roots);
    if (abs && fs.existsSync(abs)) return raw;
  }
  return candidates[0] || '';
}

// ---------------------------------------------------------------------------
// § trace
// ---------------------------------------------------------------------------

function setTraceDirForTest(dir) {
  _traceOverride = dir;
}

function traceBase() {
  return _traceOverride || TRACE_DIR;
}

function paths() {
  const base = traceBase();
  return {
    base,
    active: path.join(base, 'active.jsonl'),
    snapshots: path.join(base, 'snapshots'),
    archive: path.join(base, 'archive'),
    lastStaged: path.join(base, '.last-staged.json'),
  };
}

function appendActiveTrace(record) {
  const p = paths();
  ensureDir(path.dirname(p.active));
  ensureDir(p.snapshots);
  fs.appendFileSync(p.active, JSON.stringify(record) + '\n', 'utf8');
}

function readAllActiveTraces() {
  const p = paths().active;
  if (!fs.existsSync(p)) return [];
  const content = readTextUtf8(p);
  if (!content.trim()) return [];
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function loadActiveTraces(filesFilter, roots) {
  const records = readAllActiveTraces();
  if (!filesFilter) return records;
  const rootHints = roots || [];
  return records.filter((r) => filesFilter.some((f) => traceMatchesStagedFile(r, f, rootHints)));
}

function archiveStagedTraces(files, roots) {
  const p = paths();
  ensureDir(p.archive);
  const day = new Date().toISOString().slice(0, 10);
  const archiveFile = path.join(p.archive, `${day}.jsonl`);
  const traces = loadActiveTraces(files, roots);
  for (const t of traces) {
    fs.appendFileSync(archiveFile, JSON.stringify(t) + '\n', 'utf8');
  }
  return traces;
}

/**
 * Trace matching key at commit time. Prefer stored fileKey; legacy traces may re-resolve.
 */
function effectiveTraceFileKey(trace, roots) {
  const stored = traceFileKey(trace);
  if (stored) return stored;
  const identity = resolveFileIdentity({
    rawFile: trace.file,
    fileHint: trace.file,
    roots: roots || [],
  });
  return identity?.file ? toFileKey(identity.file) : '';
}

function traceMatchesStagedFile(trace, file, roots) {
  return toFileKey(file) === effectiveTraceFileKey(trace, roots);
}

function clearStagedFromActive(files, roots) {
  const fileKeySet = new Set(files.map((f) => toFileKey(f)));
  const rootHints = roots || [];
  const p = paths();
  const remain = loadActiveTraces(null).filter(
    (t) => !fileKeySet.has(effectiveTraceFileKey(t, rootHints))
  );
  const text = remain.map((t) => JSON.stringify(t)).join('\n') + (remain.length ? '\n' : '');
  writeTextUtf8(p.active, text);
}

/** Orphan prune threshold: keep if younger than 7 days or still pending. */
const PRUNE_ACTIVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseTraceTsMs(ts) {
  if (ts == null || ts === '') return NaN;
  const ms = Date.parse(String(ts));
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Pending paths from `git status --porcelain -z` (dirty + untracked), keyed like attribution.
 * @returns {Set<string>|null} null when git status is unavailable (caller must abort prune)
 */
function loadPendingFileKeySet(repoRoot) {
  const keySet = new Set();
  try {
    const zOut = execGit('status --porcelain -z', repoRoot);
    for (const rel of parsePorcelainZPaths(zOut, null)) {
      const k = toFileKey(rel);
      if (k) keySet.add(k);
    }
    return keySet;
  } catch {
    // fail-open: unknown pending → do not prune (null signals abort)
    return null;
  }
}

/**
 * Prune orphan rows from active.jsonl (§4).
 * Keep if: ts unparseable | age < 7d | path still pending (dirty/untracked).
 * Does NOT delete solely because path matches excludePaths.
 * On git status failure: abort without rewrite (kept=all, removed=0).
 * @param {{ now?: Date|number|string, dryRun?: boolean }} [opts]
 * @returns {{ kept: number, removed: number }}
 */
function pruneActiveTrace(opts) {
  const options = opts || {};
  const nowMs =
    options.now == null
      ? Date.now()
      : options.now instanceof Date
        ? options.now.getTime()
        : typeof options.now === 'number'
          ? options.now
          : Date.parse(String(options.now));
  const dryRun = !!options.dryRun;

  const roots = [resolveRepoRoot([]) || process.cwd()];
  const repoRoot = roots[0];
  const records = readAllActiveTraces();
  const pendingKeys = loadPendingFileKeySet(repoRoot);
  if (pendingKeys == null) {
    // Cannot know dirty set — keep all aged rows rather than wrongly deleting them
    return { kept: records.length, removed: 0 };
  }
  const keep = [];
  let removed = 0;

  for (const t of records) {
    const tsMs = parseTraceTsMs(t.ts);
    if (!Number.isFinite(tsMs)) {
      keep.push(t);
      continue;
    }
    if (nowMs - tsMs < PRUNE_ACTIVE_MAX_AGE_MS) {
      keep.push(t);
      continue;
    }
    const fk = effectiveTraceFileKey(t, roots);
    if (fk && pendingKeys.has(fk)) {
      keep.push(t);
      continue;
    }
    removed++;
  }

  if (!dryRun) {
    const p = paths();
    const text = keep.map((t) => JSON.stringify(t)).join('\n') + (keep.length ? '\n' : '');
    writeTextUtf8(p.active, text);
  }

  return { kept: keep.length, removed };
}

function writeLastStaged(files) {
  writeTextUtf8(paths().lastStaged, JSON.stringify(files));
}

function readLastStaged() {
  const fp = paths().lastStaged;
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(readTextUtf8(fp));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// § snapshot
// ---------------------------------------------------------------------------

const FILE_KEY_HASH_RE = /^[a-f0-9]{64}$/;

function snapshotKey(fileKey) {
  return fileKey + '.txt';
}

function writeSnapshot(file, text) {
  const fileKey = toFileKey(file);
  const p = paths();
  ensureDir(p.snapshots);
  writeTextUtf8(path.join(p.snapshots, snapshotKey(fileKey)), text ?? '');
}

function readSnapshot(file) {
  const fp = path.join(paths().snapshots, snapshotKey(toFileKey(file)));
  if (fs.existsSync(fp)) return readTextUtf8(fp);
  return null;
}

function consumeSnapshot(file) {
  const fp = path.join(paths().snapshots, snapshotKey(toFileKey(file)));
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

// ---------------------------------------------------------------------------
// § attributeDiff (V1.1)
// ---------------------------------------------------------------------------

function attributeDiff(stagedDiff, traces, roots) {
  const byFileKey = new Map();
  const rootHints = roots || [];
  for (const t of traces) {
    const fk = effectiveTraceFileKey(t, rootHints);
    if (!fk) continue;
    if (!byFileKey.has(fk)) byFileKey.set(fk, []);
    byFileKey.get(fk).push(t);
  }

  let aiAdded = 0;
  let aiDeleted = 0;
  const aiFiles = new Set();

  for (const { file, fileKey, hunks } of stagedDiff) {
    const fk = fileKey || toFileKey(file);
    const records = byFileKey.get(fk) || [];
    const addHashes = new Set();
    const delHashes = new Set();
    for (const r of records) {
      for (const ln of r.lines || []) {
        if (ln.op === 'add') addHashes.add(ln.hash);
        if (ln.op === 'del') delHashes.add(ln.hash);
      }
    }
    if (!hunks.length) continue;

    const marked = new Array(hunks.length).fill(false);

    // Rule A — hash match
    for (let i = 0; i < hunks.length; i++) {
      const h = hunks[i];
      const hit =
        (h.type === 'add' && addHashes.has(h.hash)) ||
        (h.type === 'del' && delHashes.has(h.hash));
      if (hit) marked[i] = true;
    }

    // Rule B — adjacent del+add pair, trace hits any side → whole pair AI
    for (let i = 0; i < hunks.length - 1; i++) {
      const a = hunks[i];
      const b = hunks[i + 1];
      if (a.type === 'del' && b.type === 'add') {
        const pairHit =
          delHashes.has(a.hash) ||
          addHashes.has(a.hash) ||
          delHashes.has(b.hash) ||
          addHashes.has(b.hash);
        if (pairHit) {
          marked[i] = true;
          marked[i + 1] = true;
        }
      }
    }

    let fAdd = 0;
    let fDel = 0;
    for (let i = 0; i < hunks.length; i++) {
      if (!marked[i]) continue;
      if (!isCountableLine(hunks[i].line)) continue;
      if (hunks[i].type === 'add') fAdd++;
      else fDel++;
    }
    if (fAdd + fDel > 0) aiFiles.add(file);
    aiAdded += fAdd;
    aiDeleted += fDel;
  }

  return { aiAdded, aiDeleted, aiFiles };
}

// ---------------------------------------------------------------------------
// § trailer + git parse
// ---------------------------------------------------------------------------

/** Git 对非 ASCII 路径用引号 + 八进制转义，如 "terp-app-parent/sql/\346\225\260..." */
function unescapeGitQuotedPath(segment) {
  const bytes = [];
  let i = 0;
  while (i < segment.length) {
    const ch = segment[i];
    if (ch === '\\' && i + 1 < segment.length) {
      const next = segment[i + 1];
      if (next >= '0' && next <= '7') {
        let oct = '';
        let j = i + 1;
        while (j < segment.length && j < i + 4 && segment[j] >= '0' && segment[j] <= '7') {
          oct += segment[j];
          j++;
        }
        bytes.push(parseInt(oct, 8));
        i = j;
        continue;
      }
      const map = { n: 0x0a, t: 0x09, r: 0x0d, '\\': 0x5c, '"': 0x22 };
      if (Object.prototype.hasOwnProperty.call(map, next)) {
        bytes.push(map[next]);
        i += 2;
        continue;
      }
    }
    const code = ch.charCodeAt(0);
    if (code < 128) {
      bytes.push(code);
    } else {
      for (const b of Buffer.from(ch, 'utf8')) bytes.push(b);
    }
    i++;
  }
  return Buffer.from(bytes).toString('utf8');
}

function normalizeGitPath(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = unescapeGitQuotedPath(s.slice(1, -1));
  }
  if (s.startsWith('b/')) s = s.slice(2);
  return s.replace(/\\/g, '/');
}

function normalizePathForKey(raw) {
  if (raw == null || raw === '') return '';
  let p = normalizeGitPath(String(raw));
  if (!p) return '';
  return p.normalize('NFC');
}

function hashNormalizedPath(normalizedPath) {
  return crypto.createHash('sha256').update(normalizedPath, 'utf8').digest('hex');
}

/**
 * Canonical repo-relative path key for trace storage and matching.
 * Pipeline: git unescape → slash normalize → NFC → SHA256.
 * `file` on trace records is display-only; all logic uses this hash key.
 */
function toFileKey(raw) {
  const p = normalizePathForKey(raw);
  if (!p) return '';
  return hashNormalizedPath(p);
}

/** Trace record matching key — hash only; `file` is display-only. */
function traceFileKey(record) {
  return record.fileKey || '';
}

function countNonEmptyLinesFromStaged(staged) {
  let lines = 0;
  for (const s of staged) {
    for (const h of s.hunks) {
      if (isCountableLine(h.line)) lines++;
    }
  }
  return lines;
}

function parseNumstatFiles() {
  const out = execGit('diff --cached --numstat');
  let files = 0;
  for (const row of out.split('\n').filter(Boolean)) {
    const [a, d] = row.split('\t');
    if (a === '-' || d === '-') continue;
    files++;
  }
  return files;
}

function parseNumstat() {
  // Lines：仅非空行（与 AI 归因 / hashLine 口径一致）；Files：文本变更文件数（跳过 binary）
  const staged = parseStagedDiff();
  return { lines: countNonEmptyLinesFromStaged(staged), files: parseNumstatFiles() };
}

function parseStagedDiff() {
  const out = execGit('diff --cached -U0 --no-color');
  const result = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('+++ ')) {
      const file = normalizeGitPath(line.slice(4));
      current = { file, fileKey: toFileKey(file), hunks: [] };
      result.push(current);
    } else if (line.startsWith('+') && !line.startsWith('+++') && current) {
      const text = line.slice(1);
      current.hunks.push({ type: 'add', line: text, hash: hashLine(text) });
    } else if (line.startsWith('-') && !line.startsWith('---') && current) {
      const text = line.slice(1);
      current.hunks.push({ type: 'del', line: text, hash: hashLine(text) });
    }
  }
  return result;
}

function buildTrailer({ authored, lines, files, aiAdded, aiDeleted, aiFiles }) {
  const rows = [
    `AI-Authored: ${authored}`,
    `Lines: ${lines}`,
    `Files: ${files}`,
  ];
  if (authored === 'yes') {
    rows.push(`AI-Lines-Added: ${aiAdded}`);
    rows.push(`AI-Lines-Deleted: ${aiDeleted}`);
    rows.push(`AI-Files: ${aiFiles}`);
    const email = process.env.CURSOR_USER_EMAIL;
    if (email) rows.push(`AI_EMAIL: ${email}`);
  }
  return rows.join('\n');
}

function injectTrailer(messagePath, trailerBlock) {
  let msg = readTextUtf8(messagePath);
  msg = msg.replace(/\nAI-Authored:[\s\S]*$/m, '').trimEnd();
  writeTextUtf8(messagePath, msg + '\n\n' + trailerBlock + '\n');
}

/**
 * 注入 trailer，但禁止把已存在的 `AI-Authored: yes` 降级覆盖。
 * 触发场景：commit 成功后立即 pull --rebase / amend / interactive rebase，
 * 此时 active trace 已被 post-commit 清空，重算会得到 no/unknown；
 * 已有 yes 的结果应保留（只允许升格 no→yes，禁止降级 yes→no/unknown）。
 */
function injectTrailerPreservingYes(messagePath, trailerBlock, authored) {
  const existing = parseTrailerFromBody(readTextUtf8(messagePath));
  if (existing.hasTrailer && existing.authored === 'yes' && authored !== 'yes') {
    return;
  }
  injectTrailer(messagePath, trailerBlock);
}

function parseTrailerFromBody(body) {
  const text = String(body);
  const match = text.match(/\nAI-Authored:[\s\S]*$/m);
  if (!match) {
    return {
      hasTrailer: false,
      authored: null,
      lines: null,
      files: null,
      aiAdded: null,
      aiDeleted: null,
      aiFiles: null,
      aiEmail: null,
    };
  }

  const trailerText = match[0];

  const get = (key) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
    const m = trailerText.match(re);
    return m ? m[1].trim() : null;
  };

  const num = (key) => {
    const v = get(key);
    return v != null && v !== '' ? Number(v) : null;
  };

  return {
    hasTrailer: true,
    authored: get('AI-Authored'),
    lines: num('Lines'),
    files: num('Files'),
    aiAdded: num('AI-Lines-Added'),
    aiDeleted: num('AI-Lines-Deleted'),
    aiFiles: num('AI-Files'),
    aiEmail: get('AI_EMAIL'),
  };
}

// ---------------------------------------------------------------------------
// § git hook runners
// ---------------------------------------------------------------------------

function countStagedDirections(staged) {
  let stagedAdd = 0;
  let stagedDel = 0;
  for (const s of staged) {
    for (const h of s.hunks) {
      if (!isCountableLine(h.line)) continue;
      if (h.type === 'add') stagedAdd++;
      else if (h.type === 'del') stagedDel++;
    }
  }
  return { stagedAdd, stagedDel };
}

function capAiLineCounts(aiAdded, aiDeleted, stagedAdd, stagedDel, lines) {
  let cappedAdd = Math.min(aiAdded, stagedAdd);
  let cappedDel = Math.min(aiDeleted, stagedDel);
  let total = cappedAdd + cappedDel;
  if (total <= lines) return { cappedAdd, cappedDel };

  let excess = total - lines;
  while (excess > 0 && (cappedAdd > 0 || cappedDel > 0)) {
    if (cappedDel >= cappedAdd && cappedDel > 0) {
      cappedDel--;
    } else if (cappedAdd > 0) {
      cappedAdd--;
    } else {
      cappedDel--;
    }
    excess--;
  }
  return { cappedAdd, cappedDel };
}

/** Git hook names that may appear as argv[0] when Husky calls `node hooks.cjs <hook> "$@"`. */
const GIT_HOOK_ARG_NAMES = new Set([
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-commit',
  'pre-push',
]);

function isGitHookArgName(arg) {
  const base = path.basename(String(arg || '')).toLowerCase();
  return GIT_HOOK_ARG_NAMES.has(base);
}

/**
 * Resolve COMMIT_EDITMSG (or equivalent) from prepare-commit-msg argv.
 * Skips leading hook-name tokens so Husky's
 * `node hooks.cjs prepare-commit-msg "$@"` does not treat the hook name as a file.
 */
function resolveCommitMessagePath(argv) {
  const args = Array.isArray(argv) ? argv : [];
  return args.find((a) => {
    if (a == null || a === '') return false;
    const s = String(a);
    if (s.startsWith('-')) return false;
    if (isGitHookArgName(s)) return false;
    return true;
  });
}

function runPrepareCommitMsg(argv) {
  const messagePath = resolveCommitMessagePath(argv);
  if (!messagePath) return;

  const roots = [resolveRepoRoot([]) || process.cwd()];

  try {
    const stagedAll = parseStagedDiff();
    const staged = stagedAll.filter((s) => !shouldExcludeRelPath(s.file));
    // Staged entirely excluded → do not inject or modify AI- trailer
    if (stagedAll.length > 0 && staged.length === 0) {
      writeLastStaged([]);
      return;
    }

    const lines = countNonEmptyLinesFromStaged(staged);
    const files =
      staged.length === stagedAll.length ? parseNumstatFiles() : staged.length;
    const stagedFiles = staged.map((s) => s.file);
    const traces = loadActiveTraces(stagedFiles, roots);
    const { aiAdded, aiDeleted, aiFiles } = attributeDiff(staged, traces, roots);
    const aiTotal = aiAdded + aiDeleted;
    const authored = aiTotal > 0 ? 'yes' : 'no';

    let cappedAdd = aiAdded;
    let cappedDel = aiDeleted;
    if (authored === 'yes') {
      const { stagedAdd, stagedDel } = countStagedDirections(staged);
      ({ cappedAdd, cappedDel } = capAiLineCounts(
        aiAdded,
        aiDeleted,
        stagedAdd,
        stagedDel,
        lines
      ));
    }

    const trailer = buildTrailer({
      authored,
      lines,
      files,
      aiAdded: authored === 'yes' ? cappedAdd : 0,
      aiDeleted: authored === 'yes' ? cappedDel : 0,
      aiFiles: aiFiles.size,
    });
    injectTrailerPreservingYes(messagePath, trailer, authored);
    writeLastStaged(stagedFiles);
  } catch (e) {
    try {
      const { lines, files } = parseNumstat();
      injectTrailerPreservingYes(
        messagePath,
        buildTrailer({ authored: 'unknown', lines, files }),
        'unknown'
      );
    } catch {
      injectTrailerPreservingYes(
        messagePath,
        buildTrailer({ authored: 'unknown', lines: 0, files: 0 }),
        'unknown'
      );
    }
    console.error('[ai-stats] attribution failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// § missing AI trailer warn (F-MISSING-TRAILER-WARN / §6.4) — never block
// ---------------------------------------------------------------------------

const MISSING_TRAILER_COMMIT_WARN = [
  '[ai-stats] 本次提交缺少 AI 统计标记（检测到 AI 改动）。',
  '补救：自动 soft reset + 重 commit（或手动 git reset --soft HEAD~1 后终端再 commit）。',
  '建议：用终端提交，不要用 SCM 面板。',
].join('\n');

const MISSING_TRAILER_PUSH_HEADER = '[ai-stats] 以下提交缺少 AI 统计标记，推送仍继续：';
const MISSING_TRAILER_PUSH_FOOTER = [
  '补救（未推送）：自动补标或 git reset --soft HEAD~1 后终端再 commit。',
  '建议：以后用终端 git commit。',
].join('\n');

function messageHasAiAuthored(body) {
  return /^AI-Authored:\s*/m.test(String(body || ''));
}

function listCommitChangedFiles(rev) {
  const out = execGit(`diff-tree --no-commit-id --name-only -r ${rev}`);
  return String(out || '')
    .split('\n')
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

function loadRecentArchiveTraces() {
  const dir = paths().archive;
  if (!fs.existsSync(dir)) return [];
  let names = [];
  try {
    names = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .slice(-14);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    try {
      const text = readTextUtf8(path.join(dir, name));
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          /* skip bad line */
        }
      }
    } catch {
      /* skip unreadable day file */
    }
  }
  return out;
}

/** Agent fileKey set from active + recent archive (warn path; prefer fewer false positives). */
function collectAgentEvidenceFileKeys(roots) {
  const keys = new Set();
  const add = (records) => {
    for (const t of records) {
      if (t.source && t.source !== 'agent') continue;
      const k = effectiveTraceFileKey(t, roots);
      if (k) keys.add(k);
    }
  };
  try {
    add(readAllActiveTraces());
  } catch {
    /* ignore */
  }
  try {
    add(loadRecentArchiveTraces());
  } catch {
    /* ignore */
  }
  return keys;
}

/** Auto-remediate evidence: active.jsonl only (no archive). */
function collectActiveAgentFileKeys(roots) {
  const keys = new Set();
  try {
    for (const t of readAllActiveTraces()) {
      if (t.source && t.source !== 'agent') continue;
      const k = effectiveTraceFileKey(t, roots);
      if (k) keys.add(k);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

function filesIntersectAgentEvidence(files, roots) {
  if (!files || !files.length) return false;
  const keys = collectAgentEvidenceFileKeys(roots);
  if (!keys.size) return false;
  return files.some((f) => keys.has(toFileKey(f)));
}

function filesIntersectActiveAgentEvidence(files, roots) {
  if (!files || !files.length) return false;
  const keys = collectActiveAgentFileKeys(roots);
  if (!keys.size) return false;
  return files.some((f) => keys.has(toFileKey(f)));
}

function isMergeHead() {
  try {
    const line = String(execGit('rev-list --parents -n 1 HEAD')).trim();
    return line.split(/\s+/).filter(Boolean).length > 2;
  } catch {
    return true;
  }
}

/** HEAD already contained in upstream tip → treated as pushed (do not rewrite). */
function isHeadContainedInUpstream() {
  try {
    execGit('rev-parse --abbrev-ref @{u}');
  } catch {
    return false;
  }
  try {
    execGit('merge-base --is-ancestor HEAD @{u}');
    return true;
  } catch {
    return false;
  }
}

function remediatingLockPath() {
  return path.join(paths().base, 'remediating.lock');
}

function acquireRemediatingLock() {
  const fp = remediatingLockPath();
  ensureDir(path.dirname(fp));
  try {
    const fd = fs.openSync(fp, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseRemediatingLock() {
  try {
    fs.unlinkSync(remediatingLockPath());
  } catch {
    /* ignore */
  }
}

/**
 * Evaluate F-SCM-AUTO-REMEDIATE gates for HEAD.
 * @returns {{ ok: boolean, reason: string, body?: string, files?: string[], oldSha?: string, roots?: string[] }}
 */
function evaluateAutoRemediateGates(opts) {
  if (process.env.AI_STATS_NO_AUTO_FIX === '1') {
    return { ok: false, reason: 'disabled' };
  }
  if (process.env.AI_STATS_REMEDIATING === '1') {
    return { ok: false, reason: 'nested' };
  }
  const roots = (opts && opts.roots) || [resolveRepoRoot([]) || process.cwd()];
  let body;
  try {
    body = execGit('log -1 --format=%B');
  } catch {
    return { ok: false, reason: 'no-head' };
  }
  if (messageHasAiAuthored(body)) {
    return { ok: false, reason: 'has-trailer' };
  }
  if (isMergeHead()) {
    return { ok: false, reason: 'merge' };
  }
  if (isHeadContainedInUpstream()) {
    return { ok: false, reason: 'already-pushed' };
  }
  let files = [];
  try {
    files = listCommitChangedFiles('HEAD');
  } catch {
    return { ok: false, reason: 'no-files' };
  }
  const countable = files.filter((f) => !shouldExcludeRelPath(f));
  if (!countable.length) {
    return { ok: false, reason: 'all-excluded' };
  }
  if (!filesIntersectActiveAgentEvidence(countable, roots)) {
    return { ok: false, reason: 'no-active-evidence' };
  }
  let oldSha;
  try {
    oldSha = String(execGit('rev-parse HEAD')).trim();
  } catch {
    return { ok: false, reason: 'no-head' };
  }
  return { ok: true, reason: 'ok', body, files: countable, oldSha, roots };
}

function resolveHooksPathForRemediate(repoRoot) {
  try {
    const rel = path.relative(repoRoot, ROOT);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.replace(/\\/g, '/');
    }
  } catch {
    /* fall through */
  }
  return ROOT.replace(/\\/g, '/');
}

/**
 * Soft-reset HEAD and recommit with ai-stats hooksPath so trailer is injected.
 * @param {{ source?: string, dryRunApply?: boolean, roots?: string[] }} [opts]
 * @returns {{ remediated: boolean, reason: string, exitCode: number, oldSha?: string, newSha?: string }}
 */
function tryAutoRemediateHead(opts) {
  const source = (opts && opts.source) || 'unknown';
  try {
    if (!acquireRemediatingLock()) {
      return { remediated: false, reason: 'locked', exitCode: 0 };
    }
    const msgFile = path.join(paths().base, '.remediate-msg.txt');
    try {
      const gate = evaluateAutoRemediateGates(opts);
      if (!gate.ok) {
        return { remediated: false, reason: gate.reason, exitCode: 0 };
      }

      // Unit tests inject execGit — do not mutate real repos unless dryRunApply.
      if (_execGitForTest) {
        if (opts && opts.dryRunApply) {
          const exitCode = source === 'pre-push' ? 1 : 0;
          return {
            remediated: true,
            reason: 'ok',
            oldSha: gate.oldSha,
            newSha: 'remediateddeadbeef',
            exitCode,
            dryRun: true,
          };
        }
        return { remediated: false, reason: 'test-skip-mutate', exitCode: 0 };
      }

      const repoRoot = resolveRepoRoot([]) || process.cwd();
      const hooksPathCfg = resolveHooksPathForRemediate(repoRoot);
      writeTextUtf8(msgFile, gate.body.endsWith('\n') ? gate.body : gate.body + '\n');

      execFileSync('git', ['reset', '--soft', 'HEAD~1'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      try {
        execFileSync('git', ['-c', `core.hooksPath=${hooksPathCfg}`, 'commit', '-F', msgFile], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: { ...process.env, AI_STATS_REMEDIATING: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (commitErr) {
        try {
          execFileSync('git', ['reset', '--soft', gate.oldSha], {
            cwd: repoRoot,
            encoding: 'utf8',
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch {
          /* best effort restore */
        }
        throw commitErr;
      }

      const newSha = String(
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' })
      ).trim();
      const newBody = String(
        execFileSync('git', ['log', '-1', '--format=%B'], { cwd: repoRoot, encoding: 'utf8' })
      );
      if (!messageHasAiAuthored(newBody)) {
        console.error('[ai-stats] 自动补标后仍无 AI-Authored，保留当前 HEAD。');
        return {
          remediated: false,
          reason: 'commit-no-trailer',
          oldSha: gate.oldSha,
          newSha,
          exitCode: 0,
        };
      }

      console.error(
        `[ai-stats] 已自动补标 ${gate.oldSha.slice(0, 7)}→${newSha.slice(0, 7)}（soft reset + recommit）。`
      );
      if (source === 'pre-push') {
        console.error('[ai-stats] 请再次执行 git push 以推送补标后的提交。');
        return {
          remediated: true,
          reason: 'ok',
          oldSha: gate.oldSha,
          newSha,
          exitCode: 1,
        };
      }
      return {
        remediated: true,
        reason: 'ok',
        oldSha: gate.oldSha,
        newSha,
        exitCode: 0,
      };
    } finally {
      releaseRemediatingLock();
      try {
        fs.unlinkSync(msgFile);
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    console.error('[ai-stats] 自动补标失败:', e && e.message ? e.message : e);
    try {
      releaseRemediatingLock();
    } catch {
      /* ignore */
    }
    return { remediated: false, reason: 'error', exitCode: 0 };
  }
}

function warnMissingOnCommit() {
  const roots = [resolveRepoRoot([]) || process.cwd()];
  const body = execGit('log -1 --format=%B');
  if (messageHasAiAuthored(body)) {
    return { warned: false, exitCode: 0 };
  }

  let files = listCommitChangedFiles('HEAD');
  const lastStaged = readLastStaged();
  if ((!files || !files.length) && lastStaged && lastStaged.length) {
    files = lastStaged.slice();
  }
  if (!files.length) {
    return { warned: false, exitCode: 0 };
  }

  const countable = files.filter((f) => !shouldExcludeRelPath(f));
  // R4: all files excluded → 合法不写, no warn
  if (countable.length === 0) {
    return { warned: false, exitCode: 0 };
  }

  if (!filesIntersectAgentEvidence(countable, roots)) {
    return { warned: false, exitCode: 0 };
  }

  console.error(MISSING_TRAILER_COMMIT_WARN);
  return { warned: true, exitCode: 0 };
}

function listUnpushedCommitSummaries() {
  try {
    execGit('rev-parse --abbrev-ref @{u}');
  } catch {
    return [];
  }
  const out = execGit('log --format=%h|%s @{u}..HEAD --no-merges');
  return String(out || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('|');
      if (i < 0) return { short: line.slice(0, 7), subject: line };
      return { short: line.slice(0, i), subject: line.slice(i + 1) };
    });
}

function warnMissingOnPush() {
  const roots = [resolveRepoRoot([]) || process.cwd()];
  const candidates = [];
  for (const c of listUnpushedCommitSummaries()) {
    if (candidates.length >= 5) break;
    let body = '';
    try {
      body = execGit(`log -1 --format=%B ${c.short}`);
    } catch {
      continue;
    }
    if (messageHasAiAuthored(body)) continue;

    let files = [];
    try {
      files = listCommitChangedFiles(c.short);
    } catch {
      continue;
    }
    const countable = files.filter((f) => !shouldExcludeRelPath(f));
    if (countable.length === 0) continue;
    if (!filesIntersectAgentEvidence(countable, roots)) continue;

    candidates.push(c);
  }

  if (!candidates.length) {
    return { warned: false, exitCode: 0 };
  }

  const lines = [MISSING_TRAILER_PUSH_HEADER];
  for (const c of candidates) {
    lines.push(`  ${c.short} ${c.subject}`);
  }
  lines.push(MISSING_TRAILER_PUSH_FOOTER);
  console.error(lines.join('\n'));
  return { warned: true, exitCode: 0 };
}

/**
 * Warn when AI evidence exists but message lacks AI-Authored. Always fail-open.
 * @param {{ scope?: 'commit'|'push' }} [opts]
 * @returns {{ warned: boolean, exitCode: 0 }}
 */
function warnIfMissingTrailer(opts) {
  const scope = (opts && opts.scope) || 'commit';
  try {
    if (scope === 'push') return warnMissingOnPush();
    return warnMissingOnCommit();
  } catch {
    return { warned: false, exitCode: 0 };
  }
}

/**
 * Git pre-push: try auto-remediate HEAD, then warn. exitCode 1 only if remediating rewrote HEAD.
 */
function runPrePush() {
  try {
    const r = tryAutoRemediateHead({ source: 'pre-push' });
    if (r.remediated) return r;
    warnIfMissingTrailer({ scope: 'push' });
    return { remediated: false, reason: r.reason || 'none', exitCode: 0 };
  } catch {
    return { remediated: false, reason: 'error', exitCode: 0 };
  }
}

function runPostCommit() {
  // Warn before clearing active traces (evidence for HEAD ∩ active).
  try {
    warnIfMissingTrailer({ scope: 'commit' });
  } catch {
    /* R6: never block */
  }

  const files = readLastStaged();
  if (files && files.length) {
    const roots = [resolveRepoRoot([]) || process.cwd()];
    archiveStagedTraces(files, roots);
    clearStagedFromActive(files, roots);
    for (const f of files) consumeSnapshot(f);

    const lastStagedPath = paths().lastStaged;
    if (fs.existsSync(lastStagedPath)) fs.unlinkSync(lastStagedPath);
  }

  try {
    pruneActiveTrace();
  } catch (e) {
    console.error('[ai-stats] prune active failed:', e && e.message ? e.message : e);
  }
}

// ---------------------------------------------------------------------------
// § hook stdin (self-contained in core.cjs)
// ---------------------------------------------------------------------------

/** Cursor 在 Windows 路径上常输出非法 JSON 转义（如 f:\AI开发\...） */
function repairJsonStringEscapes(raw) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      const next = raw[i + 1];
      if (next === 'u') {
        const hex = raw.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += ch;
          escaped = true;
        } else {
          out += '\\\\';
        }
        continue;
      }
      if (next && '"\\/bfnrt'.includes(next)) {
        out += ch;
        escaped = true;
      } else {
        out += '\\\\';
      }
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') {
      out += '\\r';
      continue;
    }
    if (ch === '\t') {
      out += '\\t';
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      out += '\\u' + code.toString(16).padStart(4, '0');
      continue;
    }
    out += ch;
  }
  return out;
}

function readJsonStringAt(raw, startPos) {
  if (raw[startPos] !== '"') return { value: null, nextPos: startPos };
  let pos = startPos + 1;
  let result = '';
  while (pos < raw.length) {
    const ch = raw[pos];
    if (ch === '\\') {
      pos++;
      if (pos >= raw.length) break;
      const esc = raw[pos];
      if (esc === 'u') {
        const hex = raw.slice(pos + 1, pos + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += String.fromCharCode(parseInt(hex, 16));
          pos += 5;
          continue;
        }
        result += esc;
        pos++;
        continue;
      }
      const map = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f' };
      result += map[esc] ?? esc;
      pos++;
      continue;
    }
    if (ch === '"') return { value: result, nextPos: pos + 1 };
    result += ch;
    pos++;
  }
  return { value: result, nextPos: pos };
}

function extractJsonStringValue(raw, key) {
  const keyPattern = `"${key}"`;
  let pos = 0;
  while (pos < raw.length) {
    const idx = raw.indexOf(keyPattern, pos);
    if (idx < 0) return null;
    let after = idx + keyPattern.length;
    while (after < raw.length && /\s/.test(raw[after])) after++;
    if (raw[after] !== ':') {
      pos = idx + 1;
      continue;
    }
    after++;
    while (after < raw.length && /\s/.test(raw[after])) after++;
    if (raw[after] !== '"') {
      pos = idx + 1;
      continue;
    }
    const { value } = readJsonStringAt(raw, after);
    if (value != null) return value;
    pos = idx + 1;
  }
  return null;
}

function extractStringArray(raw, key) {
  const keyPattern = `"${key}"`;
  const idx = raw.indexOf(keyPattern);
  if (idx < 0) return null;
  let pos = idx + keyPattern.length;
  while (pos < raw.length && /\s/.test(raw[pos])) pos++;
  if (raw[pos] !== ':') return null;
  pos++;
  while (pos < raw.length && /\s/.test(raw[pos])) pos++;
  if (raw[pos] !== '[') return null;
  pos++;
  const items = [];
  while (pos < raw.length) {
    while (pos < raw.length && /\s/.test(raw[pos])) pos++;
    if (raw[pos] === ']') break;
    if (raw[pos] === ',') {
      pos++;
      continue;
    }
    if (raw[pos] === '"') {
      const { value, nextPos } = readJsonStringAt(raw, pos);
      if (value != null) items.push(value);
      pos = nextPos;
      continue;
    }
    pos++;
  }
  return items.length ? items : null;
}

/**
 * 完整 JSON.parse 失败时的降级解析：只提取 hook 元数据（路径/事件名）。
 * postToolUse 从磁盘 diff，不依赖 tool_input 中的 old_string/new_string。
 */
function parseMinimalHookPayload(text) {
  const payload = {
    hook_event_name: extractJsonStringValue(text, 'hook_event_name') || '',
    tool_name: extractJsonStringValue(text, 'tool_name') || '',
    tool_input: {},
    file_path: '',
    edits: null,
  };
  for (const key of ['path', 'file_path', 'target_file']) {
    const value = extractJsonStringValue(text, key);
    if (value) {
      payload.tool_input[key] = value;
      if (key === 'file_path') payload.file_path = value;
    }
  }
  const roots = extractStringArray(text, 'workspace_roots');
  if (roots) payload.workspace_roots = roots;
  try {
    const partial = parseJsonText(repairJsonStringEscapes(text));
    if (Array.isArray(partial.edits)) payload.edits = partial.edits;
  } catch {
    // edits optional in minimal fallback
  }
  return payload;
}

function isUsefulHookPayload(payload) {
  const toolInput = payload.tool_input || {};
  return Boolean(
    payload.hook_event_name ||
      payload.tool_name ||
      payload.file_path ||
      toolInput.path ||
      toolInput.file_path ||
      toolInput.target_file
  );
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    const repaired = repairJsonStringEscapes(text);
    if (repaired === text) throw err;
    return JSON.parse(repaired);
  }
}

function looksLikeUtf16Le(buf) {
  if (buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xfe) return true;
  if (buf[0] === 0x7b && buf[1] === 0x00) return true;
  if (buf.length >= 7 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf[3] === 0x7b && buf[4] === 0x00;
  }
  return false;
}

function looksLikeUtf16Be(buf) {
  if (buf.length < 4) return false;
  if (buf[0] === 0xfe && buf[1] === 0xff) return true;
  return buf[0] === 0x00 && buf[1] === 0x7b;
}

function decodeHookStdin(buf) {
  if (!buf.length) return '';

  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return stripBom(buf.subarray(2).toString('utf16le'));
  }
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    return stripBom(new TextDecoder('utf-16be').decode(buf.subarray(2)));
  }

  let body = buf;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    body = buf.subarray(3);
  }

  if (looksLikeUtf16Le(body)) {
    return stripBom(body.toString('utf16le'));
  }

  if (looksLikeUtf16Be(body)) {
    return stripBom(new TextDecoder('utf-16be').decode(body));
  }

  return stripBom(body.toString('utf8'));
}

function buildHookStdinCandidates(buf) {
  const list = [];
  const push = (text) => {
    const trimmed = stripBom(String(text)).trim();
    if (!trimmed) return;
    if (list.some((c) => c === trimmed)) return;
    list.push(trimmed);
  };

  push(decodeHookStdin(buf));
  push(buf.toString('utf8'));
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    push(buf.subarray(3).toString('utf8'));
  }
  if (looksLikeUtf16Le(buf) || looksLikeUtf16Le(buf.subarray(3))) {
    push(buf.toString('utf16le'));
  }
  if (looksLikeUtf16Be(buf) || looksLikeUtf16Be(buf.subarray(3))) {
    push(new TextDecoder('utf-16be').decode(buf));
  }
  return list;
}

/** @type {typeof fs | null} */
let hookStdinFsForTest = null;

function setHookStdinFsForTest(api) {
  hookStdinFsForTest = api;
}

/**
 * 读 Cursor hook stdin。Windows 上 fs.readFileSync(0) 对管道常抛
 * `EOF: end of file, read`（或返回空缓冲），导致 afterFileEdit 静默丢采集。
 * 用 readSync 循环并把 EOF/EAGAIN 视为正常结束。
 */
function readHookStdinBuffer() {
  const f = hookStdinFsForTest || fs;
  const chunks = [];
  const buf = Buffer.alloc(64 * 1024);
  const fd = typeof process.stdin.fd === 'number' ? process.stdin.fd : 0;

  const pushReadFile = () => {
    try {
      const all = f.readFileSync(fd);
      if (all && all.length) chunks.push(all);
      return true;
    } catch (e) {
      const code = e && e.code;
      // 已有分块时 EOF 视为结束；否则交给循环/空缓冲
      if (code === 'EOF' || code === 'EAGAIN') return chunks.length > 0;
      throw e;
    }
  };

  try {
    for (;;) {
      let n;
      try {
        n = f.readSync(fd, buf, 0, buf.length, null);
      } catch (e) {
        const code = e && e.code;
        if (code === 'EOF' || code === 'EAGAIN') break;
        // 部分 Node/Windows 对管道不支持 readSync，回退 readFileSync
        if (code === 'EISDIR' || code === 'ESPIPE' || code === 'EINVAL') {
          pushReadFile();
          break;
        }
        // 再试一次整读；仍失败则抛出
        if (!pushReadFile()) throw e;
        break;
      }
      if (n === 0) break;
      chunks.push(Buffer.from(buf.subarray(0, n)));
    }
  } catch (e) {
    if (!(e && (e.code === 'EOF' || e.code === 'EAGAIN'))) {
      // 最后兜底：整读一次（兼容旧路径）
      try {
        const all = f.readFileSync(0);
        if (all && all.length) return all;
      } catch {
        /* ignore */
      }
      if (!chunks.length) throw e;
    }
  }

  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
}

function parseHookStdinJson() {
  const buf = readHookStdinBuffer();
  if (!buf.length) return {};

  let lastErr;
  let lastMinimal = null;
  for (const text of buildHookStdinCandidates(buf)) {
    try {
      return parseJsonText(text);
    } catch (err) {
      lastErr = err;
      try {
        const minimal = parseMinimalHookPayload(text);
        if (isUsefulHookPayload(minimal)) lastMinimal = minimal;
      } catch {
        // ignore partial parse errors
      }
    }
  }

  if (lastMinimal) return lastMinimal;
  throw lastErr || new Error('empty hook stdin');
}

// ---------------------------------------------------------------------------
// § cursor hook collection
// ---------------------------------------------------------------------------

function collectFromEdits(edits) {
  const lines = [];
  for (const edit of edits || []) {
    lines.push(...collectFromFileDiff(edit.old_string ?? '', edit.new_string ?? ''));
  }
  return lines;
}

function appendAgentTrace({ tool, file, lines, abs, roots, edits }) {
  if (!lines.length) return;
  const identity =
    abs && fs.existsSync(abs)
      ? finalizeResolved(abs, file, roots || [])
      : resolveFileIdentity({ rawFile: file, fileHint: file, roots: roots || [], edits });
  if (!identity?.abs || !identity.file) return;
  const canonicalFile = identity.file;
  appendActiveTrace({
    v: 1,
    ts: localISOString(),
    source: 'agent',
    tool,
    file: canonicalFile,
    fileKey: toFileKey(canonicalFile),
    lines,
  });
}

function handleAfterFileEdit(input, roots) {
  const toolInput = input.tool_input || {};
  const rawFile =
    input.file_path || toolInput.file_path || toolInput.path || toolInput.target_file || '';
  if (!rawFile) return;

  let file = relPath(rawFile, roots);
  if (!file) return;

  const edits = input.edits || toolInput.edits || [];
  const resolved = resolveFileIdentity({ rawFile, fileHint: file, roots, edits });
  if (!resolved?.abs) return;

  file = resolved.file;
  const abs = resolved.abs;
  if (shouldExcludeRelPath(file)) return;

  let lines = collectFromEdits(edits);

  if (!lines.length && abs && fs.existsSync(abs)) {
    lines = collectFromFileDiff(readBaselineForPostEdit(file), readTextUtf8(abs));
  }

  appendAgentTrace({ tool: 'afterFileEdit', file, lines, abs, roots, edits });
}

function runCursorHook(input) {
  const event = input.hook_event_name || '';
  const tool = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const roots = (input.workspace_roots?.length ? input.workspace_roots : [process.cwd()]).map(
    normalizeWorkspaceRoot
  );

  // Tab 补全 — 不采集（宁漏勿滥）
  if (/afterTabFileEdit/i.test(event)) return;

  // Agent 改文件（StrReplace 等常只触发 afterFileEdit，不触发 postToolUse）
  if (/afterFileEdit/i.test(event)) {
    handleAfterFileEdit(input, roots);
    return;
  }

  const rawFile = pickToolInputPath(toolInput, roots);
  let file = relPath(rawFile, roots);
  if (!file) return;

  if (/preToolUse/i.test(event) && /write|strreplace/i.test(tool)) {
    const resolved = resolveFileIdentity({ rawFile, fileHint: file, roots, edits: toolInput });
    if (!resolved?.abs) return;
    file = resolved.file;
    if (shouldExcludeRelPath(file)) return;
    const abs = resolved.abs;
    let baseline = readSnapshot(file);
    if (baseline == null && abs && fs.existsSync(abs)) {
      baseline = readTextUtf8(abs);
    }
    writeSnapshot(file, baseline ?? '');
    return;
  }

  // Only postToolUse (AI tool edits) — afterTabFileEdit excluded to prevent
  // manual tab-edits from being misattributed as AI contributions.
  if (/postToolUse/i.test(event)) {
    const edits = toolInput.edits || input.edits || [];
    const resolved = resolveFileIdentity({ rawFile, fileHint: file, roots, edits });
    if (!resolved?.abs) {
      consumeSnapshot(file);
      return;
    }
    file = resolved.file;
    const abs = resolved.abs;
    if (shouldExcludeRelPath(file)) {
      consumeSnapshot(file);
      return;
    }
    const fileExists = abs && fs.existsSync(abs);
    let newText = null;
    if (fileExists) newText = readTextUtf8(abs);
    let oldText = readBaselineForPostEdit(file);
    let lines = [];
    if (newText != null) {
      lines = collectFromFileDiff(oldText, newText);
    }
    if (lines.length) {
      appendAgentTrace({ tool, file, lines, abs, roots, edits });
    }
    consumeSnapshot(file);
  }
}

module.exports = {
  localISOString,
  stripBom,
  readTextUtf8,
  writeTextUtf8,
  execGit,
  normalizeLine,
  hashLine,
  diffLineOps,
  linesFromDiffOps,
  collectFromFileDiff,
  collectFromEdits,
  findRepoRoot,
  resolveRepoRoot,
  toCanonicalRelPath,
  finalizeResolved,
  effectiveTraceFileKey,
  traceMatchesStagedFile,
  guessPathExt,
  parsePorcelainZPaths,
  gitModifiedRelPaths,
  resolveFileIdentity,
  collectEditAnchors,
  pickByEditContent,
  pickByMtime,
  MTIME_TIE_BREAK_MS,
  setExecGitForTest,
  setRepoRootForTest,
  setExcludePathsForTest,
  loadPathExclude,
  shouldExcludeRelPath,
  normalizeWorkspaceRoot,
  relPath,
  resolveAbsPath,
  pickToolInputPath,
  setTraceDirForTest,
  readGitHeadFile,
  readBaselineForPostEdit,
  capAiLineCounts,
  paths,
  appendActiveTrace,
  loadActiveTraces,
  readAllActiveTraces,
  archiveStagedTraces,
  clearStagedFromActive,
  pruneActiveTrace,
  PRUNE_ACTIVE_MAX_AGE_MS,
  writeLastStaged,
  readLastStaged,
  writeSnapshot,
  readSnapshot,
  consumeSnapshot,
  attributeDiff,
  parseNumstat,
  parseNumstatFiles,
  countNonEmptyLinesFromStaged,
  isCountableLine,
  parseStagedDiff,
  normalizeGitPath,
  toFileKey,
  traceFileKey,
  snapshotKey,
  FILE_KEY_HASH_RE,
  buildTrailer,
  injectTrailer,
  injectTrailerPreservingYes,
  parseTrailerFromBody,
  resolveCommitMessagePath,
  isGitHookArgName,
  runPrepareCommitMsg,
  runPostCommit,
  runPrePush,
  warnIfMissingTrailer,
  evaluateAutoRemediateGates,
  tryAutoRemediateHead,
  collectActiveAgentFileKeys,
  filesIntersectActiveAgentEvidence,
  runCursorHook,
  parseHookStdinJson,
  readHookStdinBuffer,
  setHookStdinFsForTest,
  isUsefulHookPayload,
};
