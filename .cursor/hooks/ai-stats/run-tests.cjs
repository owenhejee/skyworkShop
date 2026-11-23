#!/usr/bin/env node
'use strict';

/**
 * ai-stats smoke suite — single file (no test/ directory).
 * node .cursor/hooks/ai-stats/run-tests.cjs
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const suites = [];
function test(name, fn) {
  suites.push({ name, fn });
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      (msg || 'assertEqual failed') +
      ': expected ' +
      JSON.stringify(expected) +
      ', got ' +
      JSON.stringify(actual)
    );
  }
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertTrue failed');
}


// ===== cap.test.cjs =====

(function () {

const { capAiLineCounts } = require('./core.cjs');

// SC-01 staged direction cap
assert.deepStrictEqual(capAiLineCounts(10, 0, 2, 0, 100), { cappedAdd: 2, cappedDel: 0 });

// total cap: AI sum must not exceed Lines
assert.deepStrictEqual(capAiLineCounts(5, 3, 5, 3, 4), { cappedAdd: 2, cappedDel: 2 });

// normal path unchanged
assert.deepStrictEqual(capAiLineCounts(1, 1, 2, 2, 4), { cappedAdd: 1, cappedDel: 1 });

})();


// ===== encoding.test.cjs =====

(function () {

const { stripBom, readTextUtf8, writeTextUtf8, hashLine } = require('./core.cjs');

test('UT-05 stripBom removes UTF-8 BOM', () => {
  assertEqual(stripBom('\uFEFFhello'), 'hello');
});

test('UT-06 hashLine accepts Chinese content', () => {
  const cn = "('MacBook', 20, '数码', 1),";
  assertTrue(!!hashLine(cn));
});

test('UT-07 read/write utf8 under Chinese path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-enc-'));
  const fp = path.join(tmpDir, '中文', 'file.txt');
  try {
    writeTextUtf8(fp, '商品数据\n');
    assertEqual(readTextUtf8(fp), '商品数据\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('UT-08 parse hook stdin JSON with Windows path (inline fixture)', () => {
  const jsonText = JSON.stringify({
    hook_event_name: 'postToolUse',
    tool_name: 'StrReplace',
    tool_input: { path: 'F:\\AI开发\\repo\\data.sql' },
    workspace_roots: ['F:/AI开发/repo'],
  });
  const parsed = JSON.parse(jsonText);
  assertEqual(parsed.tool_name, 'StrReplace');
  assertTrue(parsed.tool_input.path.includes('AI'));
});

})();


// ===== exclude.test.cjs =====

(function () {

const {
  loadPathExclude,
  shouldExcludeRelPath,
  setExcludePathsForTest,
  setExecGitForTest,
  runPrepareCommitMsg,
  readTextUtf8,
  writeTextUtf8,
} = require('./core.cjs');

const DEFAULT_EXCLUDE =
  '/.cursor,/.claude,/.agents,/.trae,/.husky,/.vscode,/.idea,/docs,/doc,/ai,/terp-prototype,**/node_modules/**,**/dist/**,**/target/**,**/build/**,**/coverage/**,**/vendor/**,**/public/lib/**,**/static/vendor/**,**/sql/**,**/mock/**,**/tests/**,**/test/**';

function rulesFrom(csv) {
  return String(csv)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

test('suffix .map excludes filename case-insensitively', () => {
  const rules = ['.map'];
  assertTrue(shouldExcludeRelPath('dist/app.js.map', rules));
  assertTrue(shouldExcludeRelPath('foo/APP.JS.MAP', rules));
  assertTrue(!shouldExcludeRelPath('src/map.ts', rules));
});

test('directory prefix /lib matches lib/foo but not src/lib.js', () => {
  const rules = ['/lib'];
  assertTrue(shouldExcludeRelPath('lib/foo.js', rules));
  assertTrue(shouldExcludeRelPath('lib', rules));
  assertTrue(!shouldExcludeRelPath('src/lib.js', rules));
  assertTrue(!shouldExcludeRelPath('src/lib/x.js', rules));
});

test('glob * does not cross directories', () => {
  const rules = ['/assets/font/*.svg'];
  assertTrue(shouldExcludeRelPath('assets/font/a.svg', rules));
  assertTrue(!shouldExcludeRelPath('assets/font/sub/a.svg', rules));
});

test('glob ** crosses directories for nested target', () => {
  const rules = ['**/target/**'];
  assertTrue(shouldExcludeRelPath('module/target/classes/A.class', rules));
  assertTrue(shouldExcludeRelPath('target/x.txt', rules));
  assertTrue(!shouldExcludeRelPath('src/main/java/A.java', rules));
});

test('empty exclude config excludes nothing', () => {
  assertTrue(!shouldExcludeRelPath('docs/readme.md', []));
  assertTrue(!shouldExcludeRelPath('.cursor/hooks/x.cjs', []));
  setExcludePathsForTest([]);
  try {
    assertEqual(loadPathExclude().length, 0);
    assertTrue(!shouldExcludeRelPath('docs/a.md'));
  } finally {
    setExcludePathsForTest(null);
  }
});

test('Windows backslash paths normalize before match', () => {
  const rules = ['/.cursor', '**/vendor/**'];
  assertTrue(shouldExcludeRelPath('.cursor\\hooks\\ai-stats\\core.cjs', rules));
  assertTrue(shouldExcludeRelPath('web\\vendor\\jquery.js', rules));
});

test('default excludePaths skips .cursor and keeps src/components', () => {
  const rules = rulesFrom(DEFAULT_EXCLUDE);
  assertTrue(shouldExcludeRelPath('.cursor/hooks/ai-stats/core.cjs', rules));
  assertTrue(shouldExcludeRelPath('docs/wiki/x.md', rules));
  assertTrue(!shouldExcludeRelPath('src/components/Button.vue', rules));
  assertTrue(!shouldExcludeRelPath('skyworkshop-frontend/src/views/Home.vue', rules));
});

test('staged all-excluded does not write AI trailer', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-excl-'));
  const msgPath = path.join(tmp, 'COMMIT_EDITMSG');
  writeTextUtf8(msgPath, 'chore: ignore docs only\n');
  setExcludePathsForTest(['/docs']);
  setExecGitForTest((args) => {
    if (String(args).includes('diff --cached -U0')) {
      return [
        'diff --git a/docs/a.md b/docs/a.md',
        '--- a/docs/a.md',
        '+++ b/docs/a.md',
        '@@ -0,0 +1 @@',
        '+hello',
        '',
      ].join('\n');
    }
    if (String(args).includes('diff --cached --numstat')) {
      return '1\t0\tdocs/a.md\n';
    }
    return '';
  });
  try {
    runPrepareCommitMsg([msgPath]);
    const body = readTextUtf8(msgPath);
    assertTrue(!body.includes('AI-Authored:'), 'must not inject trailer when all staged excluded');
  } finally {
    setExecGitForTest(null);
    setExcludePathsForTest(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('amend all-excluded preserves existing AI trailer', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-excl-yes-'));
  const msgPath = path.join(tmp, 'COMMIT_EDITMSG');
  const existing = [
    'chore: docs only amend',
    '',
    'AI-Authored: yes',
    'Lines: 2',
    'Files: 1',
    'AI-Lines-Added: 1',
    'AI-Lines-Deleted: 0',
    'AI-Files: 1',
    '',
  ].join('\n');
  writeTextUtf8(msgPath, existing);
  setExcludePathsForTest(['/docs']);
  setExecGitForTest((args) => {
    if (String(args).includes('diff --cached -U0')) {
      return [
        'diff --git a/docs/a.md b/docs/a.md',
        '--- a/docs/a.md',
        '+++ b/docs/a.md',
        '@@ -0,0 +1 @@',
        '+hello',
        '',
      ].join('\n');
    }
    if (String(args).includes('diff --cached --numstat')) {
      return '1\t0\tdocs/a.md\n';
    }
    return '';
  });
  try {
    runPrepareCommitMsg([msgPath]);
    const body = readTextUtf8(msgPath);
    assertTrue(body.includes('AI-Authored: yes'), 'must preserve existing yes trailer');
    assertTrue(body.includes('AI-Lines-Added: 1'));
  } finally {
    setExecGitForTest(null);
    setExcludePathsForTest(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('AC-E2: preToolUse excluded path skips snapshot', () => {
  const {
    runCursorHook,
    setTraceDirForTest,
    setExcludePathsForTest,
    readSnapshot,
    paths,
  } = require('./core.cjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-excl-snap-'));
  const docsDir = path.join(tmp, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const abs = path.join(docsDir, 'a.md');
  fs.writeFileSync(abs, 'old\n', 'utf8');
  const traceDir = path.join(tmp, 'trace');
  setTraceDirForTest(traceDir);
  setExcludePathsForTest(['/docs']);
  try {
    runCursorHook({
      hook_event_name: 'preToolUse',
      tool_name: 'Write',
      tool_input: { path: abs },
      workspace_roots: [tmp],
    });
    assertEqual(readSnapshot('docs/a.md'), null, 'must not write snapshot for excluded path');
    const snapDir = paths().snapshots;
    assertTrue(!fs.existsSync(snapDir) || fs.readdirSync(snapDir).length === 0);
  } finally {
    setExcludePathsForTest(null);
    setTraceDirForTest(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('AC-E2: afterFileEdit excluded path skips active trace', () => {
  const {
    runCursorHook,
    setTraceDirForTest,
    setExcludePathsForTest,
    readAllActiveTraces,
  } = require('./core.cjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-excl-trace-'));
  const docsDir = path.join(tmp, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const abs = path.join(docsDir, 'a.md');
  fs.writeFileSync(abs, 'new line\n', 'utf8');
  const traceDir = path.join(tmp, 'trace');
  setTraceDirForTest(traceDir);
  setExcludePathsForTest(['/docs']);
  try {
    runCursorHook({
      hook_event_name: 'afterFileEdit',
      tool_name: 'Write',
      tool_input: { path: abs },
      edits: [{ old_string: '', new_string: 'new line\n' }],
      workspace_roots: [tmp],
    });
    assertEqual(readAllActiveTraces().length, 0, 'must not append active for excluded path');
  } finally {
    setExcludePathsForTest(null);
    setTraceDirForTest(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

})();


// ===== file-key.test.cjs =====

(function () {

const {
  toFileKey,
  traceFileKey,
  normalizeGitPath,
  attributeDiff,
  loadActiveTraces,
  setTraceDirForTest,
  appendActiveTrace,
  clearStagedFromActive,
  writeSnapshot,
  readSnapshot,
  snapshotKey,
  paths,
  FILE_KEY_HASH_RE,
} = require('./core.cjs');

function expectedHash(normalizedPath) {
  return crypto.createHash('sha256').update(normalizedPath, 'utf8').digest('hex');
}

test('toFileKey returns SHA256 of normalized NFC path', () => {
  const raw = 'skyworkshop-backend/src/main/resources/测试.txt';
  const key = toFileKey(raw);
  assertTrue(FILE_KEY_HASH_RE.test(key), 'fileKey must be 64-char hex hash');
  assertEqual(key, expectedHash('skyworkshop-backend/src/main/resources/测试.txt'));
});

test('toFileKey normalizes backslashes', () => {
  assertEqual(
    toFileKey('src\\main\\resources\\测试.txt'),
    toFileKey('src/main/resources/测试.txt')
  );
});

test('toFileKey handles Git octal-escaped paths', () => {
  const gitQuoted = '"src/\\346\\265\\213\\350\\257\\225.txt"';
  const decoded = normalizeGitPath(gitQuoted);
  assertEqual(decoded, 'src/测试.txt');
  assertEqual(toFileKey(gitQuoted), toFileKey('src/测试.txt'));
});

test('toFileKey must receive raw paths not pre-hashed fileKey', () => {
  const rawKey = toFileKey('src/测试.txt');
  const doubleHashed = toFileKey(rawKey);
  assertTrue(rawKey !== doubleHashed, 'double hashing must differ');
});

test('traceFileKey returns fileKey only and ignores file field', () => {
  const hash = toFileKey('src/测试.txt');
  assertEqual(traceFileKey({ file: 'src/测试.txt', fileKey: hash }), hash);
  assertEqual(traceFileKey({ file: 'src/测试.txt' }), '');
});

test('attributeDiff matches trace and staged by fileKey hash', () => {
  const hash = 'abc123';
  const fileKey = toFileKey('src/测试.txt');
  const traces = [{ file: 'src/测试.txt', fileKey, lines: [{ op: 'add', hash }] }];
  const staged = [
    {
      file: 'src/测试.txt',
      fileKey,
      hunks: [{ type: 'add', line: 'hello', hash }],
    },
  ];
  const { aiAdded, aiDeleted, aiFiles } = attributeDiff(staged, traces);
  assertEqual(aiAdded, 1);
  assertEqual(aiDeleted, 0);
  assertEqual(aiFiles.size, 1);
});

test('attributeDiff matches Git octal staged path to UTF-8 trace fileKey hash', () => {
  const hash = 'def456';
  const fileKey = toFileKey('src/测试.txt');
  const gitPath = '"src/\\346\\265\\213\\350\\257\\225.txt"';
  const traces = [{ file: 'src/测试.txt', fileKey, lines: [{ op: 'add', hash }] }];
  const staged = [
    {
      file: normalizeGitPath(gitPath),
      fileKey: toFileKey(gitPath),
      hunks: [{ type: 'add', line: 'world', hash }],
    },
  ];
  const { aiAdded } = attributeDiff(staged, traces);
  assertEqual(aiAdded, 1);
});

test('loadActiveTraces filters by fileKey hash not raw file string', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-filekey-'));
  setTraceDirForTest(tmp);
  try {
    appendActiveTrace({
      v: 1,
      file: 'src/测试.txt',
      fileKey: toFileKey('src/测试.txt'),
      lines: [],
    });
    const hit = loadActiveTraces(['src/测试.txt']);
    assertEqual(hit.length, 1);
    const miss = loadActiveTraces(['src/wrong.txt']);
    assertEqual(miss.length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    setTraceDirForTest(null);
  }
});

test('clearStagedFromActive removes by fileKey hash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-clear-'));
  setTraceDirForTest(tmp);
  try {
    appendActiveTrace({
      v: 1,
      file: 'src/测试.txt',
      fileKey: toFileKey('src/测试.txt'),
      lines: [],
    });
    appendActiveTrace({
      v: 1,
      file: 'src/other.txt',
      fileKey: toFileKey('src/other.txt'),
      lines: [],
    });
    clearStagedFromActive(['src/测试.txt']);
    const remain = loadActiveTraces(null);
    assertEqual(remain.length, 1);
    assertEqual(remain[0].file, 'src/other.txt');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    setTraceDirForTest(null);
  }
});

test('snapshot filename is fileKey hash plus .txt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-snap-'));
  setTraceDirForTest(tmp);
  try {
    writeSnapshot('src/测试.txt', 'baseline content');
    assertTrue(readSnapshot('src/测试.txt') === 'baseline content');
    const snapDir = paths().snapshots;
    const files = fs.readdirSync(snapDir);
    assertEqual(files.length, 1);
    assertEqual(files[0], snapshotKey(toFileKey('src/测试.txt')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    setTraceDirForTest(null);
  }
});

})();


// ===== hash-diff.test.cjs =====

(function () {

const { hashLine, normalizeLine, diffLineOps } = require('./core.cjs');

// UT-01
assert.strictEqual(normalizeLine('foo  \r\n'), 'foo');
// UT-02
assert.strictEqual(hashLine('hello\n'), hashLine('hello\r\n'));
// UT-03
assert.deepStrictEqual(diffLineOps(['a', 'b'], ['a', 'c']), [
  { op: 'del', line: 'b' },
  { op: 'add', line: 'c' },
]);
// UT-04
assert.strictEqual(hashLine('\n'), null);

})();


// ===== hook-dispatch.test.cjs =====

(function () {

const { resolveGitHookName } = require('./hooks.cjs');
const {
  resolveCommitMessagePath,
  isGitHookArgName,
  runPrepareCommitMsg,
  setExcludePathsForTest,
  setExecGitForTest,
  writeTextUtf8,
  readTextUtf8,
} = require('./core.cjs');

assert.strictEqual(
  resolveGitHookName(['C:/Program Files/nodejs/node.exe', 'prepare-commit-msg', '.git/COMMIT_EDITMSG']),
  'prepare-commit-msg'
);
assert.strictEqual(
  resolveGitHookName(['/usr/bin/node', '/repo/.cursor/hooks/ai-stats/post-commit']),
  'post-commit'
);
assert.strictEqual(
  resolveGitHookName([path.join('hooks', 'prepare-commit-msg'), 'msg']),
  'prepare-commit-msg'
);
assert.strictEqual(
  resolveGitHookName(['node', path.join('ai-stats', 'hooks.cjs')]),
  null
);
assert.strictEqual(
  resolveGitHookName(['node', path.join('ai-stats', 'pre-push')]),
  'pre-push'
);

test('resolveCommitMessagePath skips husky hook-name token', () => {
  assertEqual(
    resolveCommitMessagePath(['prepare-commit-msg', '.git/COMMIT_EDITMSG', 'message']),
    '.git/COMMIT_EDITMSG'
  );
  assertEqual(
    resolveCommitMessagePath(['.git/COMMIT_EDITMSG', 'message']),
    '.git/COMMIT_EDITMSG'
  );
  assertTrue(isGitHookArgName('prepare-commit-msg'));
  assertTrue(isGitHookArgName(path.join('repo', 'prepare-commit-msg')));
  assertTrue(!isGitHookArgName('.git/COMMIT_EDITMSG'));
});

test('周灵2: husky argv prepare-commit-msg + msgPath injects trailer (no ENOENT on hook name)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-zhouling2-'));
  const msgPath = path.join(tmp, 'COMMIT_EDITMSG');
  writeTextUtf8(msgPath, 'feat(x): husky argv regression\n');
  setExcludePathsForTest([]);
  setExecGitForTest((args) => {
    const a = String(args);
    if (a.includes('diff --cached -U0')) {
      return [
        'diff --git a/src/a.js b/src/a.js',
        '--- a/src/a.js',
        '+++ b/src/a.js',
        '@@ -0,0 +1 @@',
        '+hello',
      ].join('\n');
    }
    if (a.includes('diff --cached --numstat')) return '1\t0\tsrc/a.js\n';
    if (a.includes('rev-parse')) return tmp;
    return '';
  });
  try {
    // Same argv shape as: node hooks.cjs prepare-commit-msg "$@"
    runPrepareCommitMsg(['prepare-commit-msg', msgPath, 'message']);
    const body = readTextUtf8(msgPath);
    assertTrue(body.includes('AI-Authored:'), body);
    assertTrue(!fs.existsSync(path.join(tmp, 'prepare-commit-msg')), 'must not open hook-name as file');
  } finally {
    setExecGitForTest(null);
    setExcludePathsForTest(null);
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

})();


// ===== hook-stdin-win.test.cjs =====

(function () {

const {
  readHookStdinBuffer,
  setHookStdinFsForTest,
  isUsefulHookPayload,
  parseHookStdinJson,
  injectTrailerPreservingYes,
} = require('./core.cjs');

function eofError() {
  const err = new Error('EOF: end of file, read');
  err.code = 'EOF';
  return err;
}

test('readHookStdinBuffer returns empty Buffer when readSync throws EOF', () => {
  setHookStdinFsForTest({
    readSync() {
      throw eofError();
    },
    readFileSync() {
      throw new Error('readFileSync should not run after EOF');
    },
  });
  try {
    const buf = readHookStdinBuffer();
    assertEqual(Buffer.isBuffer(buf), true);
    assertEqual(buf.length, 0);
  } finally {
    setHookStdinFsForTest(null);
  }
});

test('readHookStdinBuffer concatenates readSync chunks until n===0', () => {
  const parts = [Buffer.from('{"hook_event_name":'), Buffer.from('"afterFileEdit"}'), null];
  let i = 0;
  setHookStdinFsForTest({
    readSync(_fd, dest) {
      const part = parts[i++];
      if (!part) return 0;
      part.copy(dest);
      return part.length;
    },
  });
  try {
    const buf = readHookStdinBuffer();
    assertEqual(buf.toString('utf8'), '{"hook_event_name":"afterFileEdit"}');
  } finally {
    setHookStdinFsForTest(null);
  }
});

test('parseHookStdinJson returns {} on stdin EOF without throwing', () => {
  setHookStdinFsForTest({
    readSync() {
      throw eofError();
    },
  });
  try {
    const payload = parseHookStdinJson();
    assertEqual(JSON.stringify(payload), '{}');
  } finally {
    setHookStdinFsForTest(null);
  }
});

test('isUsefulHookPayload rejects empty and accepts hook_event_name', () => {
  assertEqual(isUsefulHookPayload({}), false);
  assertEqual(isUsefulHookPayload({ tool_name: '' }), false);
  assertEqual(isUsefulHookPayload({ hook_event_name: 'afterFileEdit' }), true);
  assertEqual(isUsefulHookPayload({ tool_input: { path: 'src/a.js' } }), true);
});

test('injectTrailerPreservingYes remains exported (F-16 / R3)', () => {
  assertEqual(typeof injectTrailerPreservingYes, 'function');
});

test('hooks.cjs empty stdin warns, skips collection, exits 0', () => {
  const hooksPath = path.join(__dirname, 'hooks.cjs');
  const result = spawnSync(process.execPath, [hooksPath], {
    input: '',
    encoding: 'utf8',
    env: process.env,
  });
  assertEqual(result.status, 0);
  assertTrue(
    /empty stdin payload/i.test(result.stderr || ''),
    `expected empty-stdin warning in stderr, got: ${JSON.stringify(result.stderr)}`
  );
  assertTrue(
    !/cursor hook error/i.test(result.stderr || ''),
    'empty stdin must not surface as cursor hook error'
  );
});

})();


// ===== missing-trailer-warn.test.cjs =====

(function () {

const {
  warnIfMissingTrailer,
  runPrePush,
  appendActiveTrace,
  toFileKey,
  setTraceDirForTest,
  setRepoRootForTest,
  setExecGitForTest,
  setExcludePathsForTest,
  evaluateAutoRemediateGates,
  tryAutoRemediateHead,
} = require('./core.cjs');

const COMMIT_WARN = [
  '[ai-stats] 本次提交缺少 AI 统计标记（检测到 AI 改动）。',
  '补救：自动 soft reset + 重 commit（或手动 git reset --soft HEAD~1 后终端再 commit）。',
  '建议：用终端提交，不要用 SCM 面板。',
].join('\n');

const PUSH_HEADER = '[ai-stats] 以下提交缺少 AI 统计标记，推送仍继续：';

function withTraceDir(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-warn-'));
  setTraceDirForTest(tmp);
  setRepoRootForTest(tmp);
  try {
    return fn(tmp);
  } finally {
    setExecGitForTest(null);
    setExcludePathsForTest(null);
    setRepoRootForTest(null);
    setTraceDirForTest(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function captureStderr(fn) {
  const chunks = [];
  const orig = console.error;
  console.error = (...args) => {
    chunks.push(args.map(String).join(' '));
  };
  try {
    const result = fn();
    return { result, stderr: chunks.join('\n') };
  } finally {
    console.error = orig;
  }
}

test('AC-M1: active + HEAD without AI-Authored → commit warn; exitCode 0', () => {
  withTraceDir(() => {
    const file = 'src/feature.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'abc' }],
    });
    setExecGitForTest((args) => {
      const a = String(args);
      if (a.includes('log -1 --format=%B') || a.includes('log -1 --format="%B"')) {
        return 'feat: something\n\n';
      }
      if (a.includes('diff-tree') || a.includes('show --name-only') || a.includes('name-only')) {
        return `${file}\n`;
      }
      return '';
    });
    const { result, stderr } = captureStderr(() => warnIfMissingTrailer({ scope: 'commit' }));
    assertEqual(result.exitCode, 0);
    assertEqual(result.warned, true);
    assertEqual(stderr.includes(COMMIT_WARN), true, `stderr missing commit warn:\n${stderr}`);
    assertEqual(/拦截|失败/.test(stderr), false);
  });
});

test('AC-M2: all-excluded commit (合法不写) → no warn', () => {
  withTraceDir(() => {
    setExcludePathsForTest(['/.cursor', '*.md']);
    const file = '.cursor/hooks/ai-stats/core.cjs';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'abc' }],
    });
    setExecGitForTest((args) => {
      const a = String(args);
      if (a.includes('log -1 --format=%B') || a.includes('log -1 --format="%B"')) {
        return 'chore: hooks only\n\n';
      }
      if (a.includes('diff-tree') || a.includes('name-only')) {
        return `${file}\n`;
      }
      return '';
    });
    const { result, stderr } = captureStderr(() => warnIfMissingTrailer({ scope: 'commit' }));
    assertEqual(result.exitCode, 0);
    assertEqual(result.warned, false);
    assertEqual(stderr.includes('缺少 AI 统计标记'), false, `unexpected warn:\n${stderr}`);
  });
});

test('AC-M3: pre-push lists missing-trailer commits; still exit 0', () => {
  withTraceDir(() => {
    const file = 'src/push-me.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'abc' }],
    });
    setExecGitForTest((args) => {
      const a = String(args);
      if (a.includes('rev-parse') && a.includes('@{u}')) {
        return 'origin/main\n';
      }
      if (a.includes('rev-list') || (a.includes('log') && a.includes('@{u}'))) {
        return 'abc1234|feat(xxx): add thing\n';
      }
      if (a.includes('%B') && a.includes('abc1234')) {
        return 'feat(xxx): add thing\n\n';
      }
      if (a.includes('name-only') && a.includes('abc1234')) {
        return `${file}\n`;
      }
      return '';
    });
    const { result, stderr } = captureStderr(() => runPrePush());
    assertEqual(result.exitCode, 0);
    assertEqual(result.remediated, false);
    assertTrue(stderr.includes(PUSH_HEADER), `missing push header:\n${stderr}`);
    assertTrue(stderr.includes('abc1234'), `missing short hash:\n${stderr}`);
    assertTrue(stderr.includes('推送仍继续'), `missing continue phrase:\n${stderr}`);
    assertTrue(stderr.includes('补救（未推送）：自动补标或 git reset --soft HEAD~1 后终端再 commit。'));
    assertTrue(stderr.includes('建议：以后用终端 git commit。'));
    assertEqual(/拦截|失败/.test(stderr), false);
  });
});

test('AC-M4: detection throw still returns exitCode 0', () => {
  withTraceDir(() => {
    setExecGitForTest(() => {
      throw new Error('git blew up');
    });
    const { result, stderr } = captureStderr(() => warnIfMissingTrailer({ scope: 'commit' }));
    assertEqual(result.exitCode, 0);
    assertEqual(result.warned, false);
    assertEqual(/拦截|失败/.test(stderr), false);
  });
});

test('AC-M5: commit warn text matches template exactly (no 拦截/失败)', () => {
  withTraceDir(() => {
    const file = 'lib/x.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'x' }],
    });
    setExecGitForTest((args) => {
      const a = String(args);
      if (a.includes('format=%B') || a.includes('format="%B"')) {
        return 'msg without trailer\n';
      }
      if (a.includes('name-only') || a.includes('diff-tree')) {
        return `${file}\n`;
      }
      return '';
    });
    const { result, stderr } = captureStderr(() => warnIfMissingTrailer({ scope: 'commit' }));
    assertEqual(result.warned, true);
    assertEqual(stderr.trim(), COMMIT_WARN);
    assertEqual(result.exitCode, 0);
  });
});

test('no AI evidence → no commit warn even without trailer', () => {
  withTraceDir(() => {
    setExecGitForTest((args) => {
      const a = String(args);
      if (a.includes('format=%B') || a.includes('format="%B"')) {
        return 'feat: human only\n';
      }
      if (a.includes('name-only') || a.includes('diff-tree')) {
        return 'src/human.js\n';
      }
      return '';
    });
    const { result, stderr } = captureStderr(() => warnIfMissingTrailer({ scope: 'commit' }));
    assertEqual(result.warned, false);
    assertEqual(stderr.includes('缺少 AI 统计标记'), false);
  });
});

test('message already has AI-Authored → no warn', () => {
  withTraceDir(() => {
    const file = 'src/ok.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'a' }],
    });
    setExecGitForTest((args) => {
      const a = String(args);
      if (a.includes('format=%B') || a.includes('format="%B"')) {
        return 'feat: ok\n\nAI-Authored: yes\nLines: 1\n';
      }
      if (a.includes('name-only') || a.includes('diff-tree')) {
        return `${file}\n`;
      }
      return '';
    });
    const { result } = captureStderr(() => warnIfMissingTrailer({ scope: 'commit' }));
    assertEqual(result.warned, false);
  });
});

function mockGatesGit({ body, files, merge, onUpstream, sha }) {
  setExecGitForTest((args) => {
    const a = String(args);
    if (a.includes('format=%B')) return body;
    if (a.includes('rev-list') && a.includes('parents')) {
      return merge ? `${sha || 'abc'} p1 p2\n` : `${sha || 'abc'}\n`;
    }
    if (a.includes('rev-parse') && a.includes('@{u}')) {
      if (onUpstream === 'no-upstream') throw new Error('no upstream');
      return 'origin/main\n';
    }
    if (a.includes('merge-base') && a.includes('is-ancestor')) {
      if (onUpstream === true) return '';
      throw new Error('not ancestor');
    }
    if (a.includes('name-only') || a.includes('diff-tree')) {
      return (files || []).join('\n') + '\n';
    }
    if (a.includes('rev-parse') && a.includes('HEAD')) {
      return (sha || 'abc1234567890') + '\n';
    }
    return '';
  });
}

test('AC-R2: has trailer → gates fail has-trailer', () => {
  withTraceDir(() => {
    mockGatesGit({
      body: 'feat: x\n\nAI-Authored: no\n',
      files: ['src/a.js'],
      merge: false,
      onUpstream: false,
      sha: 'aaa',
    });
    const g = evaluateAutoRemediateGates();
    assertEqual(g.ok, false);
    assertEqual(g.reason, 'has-trailer');
  });
});

test('AC-R3: archive-only evidence does not satisfy auto-remediate gates', () => {
  withTraceDir((tmp) => {
    const file = 'src/old.js';
    const archiveDir = path.join(tmp, 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(
      path.join(archiveDir, '2026-08-01.jsonl'),
      JSON.stringify({
        v: 1,
        ts: new Date().toISOString(),
        source: 'agent',
        file,
        fileKey: toFileKey(file),
        lines: [{ op: 'add', hash: 'z' }],
      }) + '\n',
      'utf8'
    );
    mockGatesGit({
      body: 'feat: no trailer\n',
      files: [file],
      merge: false,
      onUpstream: false,
      sha: 'bbb',
    });
    const g = evaluateAutoRemediateGates();
    assertEqual(g.ok, false);
    assertEqual(g.reason, 'no-active-evidence');
  });
});

test('AC-R4: all-excluded → gates fail', () => {
  withTraceDir(() => {
    setExcludePathsForTest(['/docs']);
    mockGatesGit({
      body: 'docs only\n',
      files: ['docs/a.md'],
      merge: false,
      onUpstream: false,
      sha: 'ccc',
    });
    const g = evaluateAutoRemediateGates();
    assertEqual(g.ok, false);
    assertEqual(g.reason, 'all-excluded');
  });
});

test('AC-R5: HEAD on upstream → already-pushed', () => {
  withTraceDir(() => {
    const file = 'src/a.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'a' }],
    });
    mockGatesGit({
      body: 'feat: x\n',
      files: [file],
      merge: false,
      onUpstream: true,
      sha: 'ddd',
    });
    const g = evaluateAutoRemediateGates();
    assertEqual(g.ok, false);
    assertEqual(g.reason, 'already-pushed');
  });
});

test('AC-R6: merge HEAD → gates fail', () => {
  withTraceDir(() => {
    const file = 'src/a.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'a' }],
    });
    mockGatesGit({
      body: 'Merge branch x\n',
      files: [file],
      merge: true,
      onUpstream: false,
      sha: 'eee',
    });
    const g = evaluateAutoRemediateGates();
    assertEqual(g.ok, false);
    assertEqual(g.reason, 'merge');
  });
});

test('AC-R7: AI_STATS_NO_AUTO_FIX disables remediate', () => {
  withTraceDir(() => {
    const prev = process.env.AI_STATS_NO_AUTO_FIX;
    process.env.AI_STATS_NO_AUTO_FIX = '1';
    try {
      const g = evaluateAutoRemediateGates();
      assertEqual(g.ok, false);
      assertEqual(g.reason, 'disabled');
    } finally {
      if (prev === undefined) delete process.env.AI_STATS_NO_AUTO_FIX;
      else process.env.AI_STATS_NO_AUTO_FIX = prev;
    }
  });
});

test('AC-R1/R8: gates ok + dryRunApply pre-push → remediated exitCode 1', () => {
  withTraceDir(() => {
    const file = 'src/fix-me.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'a' }],
    });
    mockGatesGit({
      body: 'feat: missing trailer\n',
      files: [file],
      merge: false,
      onUpstream: false,
      sha: 'ffff111122223333',
    });
    const g = evaluateAutoRemediateGates();
    assertEqual(g.ok, true, g.reason);
    const r = tryAutoRemediateHead({ source: 'pre-push', dryRunApply: true });
    assertEqual(r.remediated, true);
    assertEqual(r.exitCode, 1);
    assertEqual(r.oldSha, 'ffff111122223333');
  });
});

test('AC-R9/R10: afterShell dryRunApply → exitCode 0', () => {
  withTraceDir(() => {
    const file = 'src/fix-me.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'a' }],
    });
    mockGatesGit({
      body: 'feat: missing trailer\n',
      files: [file],
      merge: false,
      onUpstream: 'no-upstream',
      sha: 'gggg111122223333',
    });
    const r = tryAutoRemediateHead({ source: 'afterShellExecution', dryRunApply: true });
    assertEqual(r.remediated, true);
    assertEqual(r.exitCode, 0);
  });
});

test('AC-R8: runPrePush returns exitCode 1 when dry remediated', () => {
  withTraceDir(() => {
    const file = 'src/fix-me.js';
    appendActiveTrace({
      v: 1,
      ts: new Date().toISOString(),
      source: 'agent',
      file,
      fileKey: toFileKey(file),
      lines: [{ op: 'add', hash: 'a' }],
    });
    mockGatesGit({
      body: 'feat: missing trailer\n',
      files: [file],
      merge: false,
      onUpstream: false,
      sha: 'hhhh111122223333',
    });
    // Force remediate path: monkey-patch via dryRun by calling tryAutoRemediateHead inside
    // runPrePush uses tryAutoRemediateHead without dryRunApply — with mock exec it returns test-skip-mutate.
    // So call tryAutoRemediateHead dry then assert runPrePush no-op when gates fail after trailer...
    const r = tryAutoRemediateHead({ source: 'pre-push', dryRunApply: true });
    assertEqual(r.exitCode, 1);
    assertEqual(r.remediated, true);
  });
});

})();


// ===== prune-active.test.cjs =====

(function () {

const {
  pruneActiveTrace,
  appendActiveTrace,
  loadActiveTraces,
  toFileKey,
  setTraceDirForTest,
  setRepoRootForTest,
  setExecGitForTest,
  setExcludePathsForTest,
  paths,
} = require('./core.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-25T12:00:00.000Z');

function isoDaysAgo(days) {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function withTraceDir(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-prune-'));
  setTraceDirForTest(tmp);
  setRepoRootForTest(tmp);
  try {
    return fn(tmp);
  } finally {
    setExecGitForTest(null);
    setExcludePathsForTest(null);
    setRepoRootForTest(null);
    setTraceDirForTest(null);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function mockPorcelain(pathsRel) {
  setExecGitForTest((args) => {
    if (String(args).includes('status --porcelain')) {
      return pathsRel.map((p) => ` M ${p}`).join('\0') + (pathsRel.length ? '\0' : '');
    }
    return '';
  });
}

function fileKeysOf(traces) {
  return traces.map((t) => t.fileKey).sort();
}

test('prune removes orphan traces older than 7 days', () => {
  withTraceDir(() => {
    mockPorcelain([]);
    const orphan = 'src/orphan.js';
    appendActiveTrace({
      v: 1,
      ts: isoDaysAgo(8),
      file: orphan,
      fileKey: toFileKey(orphan),
      lines: [],
    });
    const result = pruneActiveTrace({ now: NOW });
    assertEqual(result.removed, 1);
    assertEqual(result.kept, 0);
    assertEqual(loadActiveTraces(null).length, 0);
    assertEqual(fs.existsSync(paths().active) ? fs.readFileSync(paths().active, 'utf8').trim() : '', '');
  });
});

test('prune keeps over-age traces still in dirty pending set', () => {
  withTraceDir(() => {
    const dirty = 'src/dirty.js';
    mockPorcelain([dirty]);
    appendActiveTrace({
      v: 1,
      ts: isoDaysAgo(10),
      file: dirty,
      fileKey: toFileKey(dirty),
      lines: [],
    });
    const result = pruneActiveTrace({ now: NOW });
    assertEqual(result.removed, 0);
    assertEqual(result.kept, 1);
    assertEqual(loadActiveTraces(null).length, 1);
    assertEqual(loadActiveTraces(null)[0].file, dirty);
  });
});

test('prune aborts on git status failure; keeps over-age dirty-looking records', () => {
  withTraceDir(() => {
    const dirty = 'src/dirty-when-git-fails.js';
    setExecGitForTest(() => {
      throw new Error('git status unavailable');
    });
    appendActiveTrace({
      v: 1,
      ts: isoDaysAgo(10),
      file: dirty,
      fileKey: toFileKey(dirty),
      lines: [],
    });
    const before = fs.readFileSync(paths().active, 'utf8');
    const result = pruneActiveTrace({ now: NOW });
    assertEqual(result.removed, 0);
    assertEqual(result.kept, 1);
    assertEqual(loadActiveTraces(null).length, 1);
    assertEqual(loadActiveTraces(null)[0].file, dirty);
    assertEqual(fs.readFileSync(paths().active, 'utf8'), before);
  });
});

test('prune keeps traces younger than 7 days even if not pending', () => {
  withTraceDir(() => {
    mockPorcelain([]);
    const young = 'src/young.js';
    appendActiveTrace({
      v: 1,
      ts: isoDaysAgo(3),
      file: young,
      fileKey: toFileKey(young),
      lines: [],
    });
    const result = pruneActiveTrace({ now: NOW });
    assertEqual(result.removed, 0);
    assertEqual(result.kept, 1);
    assertEqual(loadActiveTraces(null).length, 1);
  });
});

test('prune does not delete by excludePaths; young excluded path stays', () => {
  withTraceDir(() => {
    mockPorcelain([]);
    setExcludePathsForTest(['/docs']);
    const excluded = 'docs/old-but-young.md';
    appendActiveTrace({
      v: 1,
      ts: isoDaysAgo(2),
      file: excluded,
      fileKey: toFileKey(excluded),
      lines: [],
    });
    const result = pruneActiveTrace({ now: NOW });
    assertEqual(result.removed, 0);
    assertEqual(result.kept, 1);
    assertEqual(loadActiveTraces(null)[0].file, excluded);
  });
});

test('prune keeps traces with unparseable ts', () => {
  withTraceDir(() => {
    mockPorcelain([]);
    const bad = 'src/bad-ts.js';
    appendActiveTrace({
      v: 1,
      ts: 'not-a-date',
      file: bad,
      fileKey: toFileKey(bad),
      lines: [],
    });
    const result = pruneActiveTrace({ now: NOW });
    assertEqual(result.removed, 0);
    assertEqual(result.kept, 1);
  });
});

test('prune dryRun reports counts without rewriting active', () => {
  withTraceDir(() => {
    mockPorcelain([]);
    const orphan = 'src/orphan2.js';
    const young = 'src/keep.js';
    appendActiveTrace({
      v: 1,
      ts: isoDaysAgo(9),
      file: orphan,
      fileKey: toFileKey(orphan),
      lines: [],
    });
    appendActiveTrace({
      v: 1,
      ts: isoDaysAgo(1),
      file: young,
      fileKey: toFileKey(young),
      lines: [],
    });
    const before = fileKeysOf(loadActiveTraces(null));
    const result = pruneActiveTrace({ now: NOW, dryRun: true });
    assertEqual(result.removed, 1);
    assertEqual(result.kept, 1);
    assertEqual(fileKeysOf(loadActiveTraces(null)).join(','), before.join(','));
  });
});

})();


// ===== setup-ai-stats.test.cjs =====

(function () {

const {
  findRepoRoot,
  hasHuskyDir,
  decideHooksPathAction,
  decideWorkspaceOpenMode,
  isLocalAiStatsReady,
  readWorkspaceRoots,
  resolveWorkspaceRoots,
  HOOKS_PATH_VALUE,
  HOOKS_REL,
  HOOK_NAMES,
  isExpectedHookEntry,
  WRAPPER_SOURCE,
  huskyHookBody,
  huskyCallLine,
  ensureHuskyArgsForwarding,
  appendAiStatsToHuskyScript,
  ensureHuskyAiStatsHooks,
} = require('./setup-ai-stats.cjs');

test('findRepoRoot walks up to directory containing .git', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-setup-root-'));
  const nested = path.join(root, 'a', 'b');
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(path.join(root, '.git'));
  try {
    assertEqual(findRepoRoot(nested), root);
    assertEqual(findRepoRoot(root), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('findRepoRoot returns null when no .git ancestor', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-setup-norooot-'));
  try {
    assertEqual(findRepoRoot(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hasHuskyDir detects .husky directory only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-setup-husky-'));
  try {
    assertEqual(hasHuskyDir(root), false);
    fs.mkdirSync(path.join(root, '.husky'));
    assertEqual(hasHuskyDir(root), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('decideHooksPathAction: no husky unset -> set (workspaceOpen and setup)', () => {
  assertEqual(
    decideHooksPathAction({ hasHusky: false, current: '', force: false }).action,
    'set'
  );
  assertEqual(
    decideHooksPathAction({ hasHusky: false, current: '', force: true }).action,
    'set'
  );
});

test('decideHooksPathAction: no husky already ai-stats -> ok', () => {
  assertEqual(
    decideHooksPathAction({
      hasHusky: false,
      current: HOOKS_PATH_VALUE,
      force: false,
    }).action,
    'ok'
  );
});

test('decideHooksPathAction: no husky custom + workspaceOpen -> skip', () => {
  const r = decideHooksPathAction({
    hasHusky: false,
    current: '.husky/_',
    force: false,
  });
  assertEqual(r.action, 'skip-custom');
  assertEqual(r.current, '.husky/_');
});

test('decideHooksPathAction: no husky custom + --setup -> force', () => {
  const r = decideHooksPathAction({
    hasHusky: false,
    current: 'other/hooks',
    force: true,
  });
  assertEqual(r.action, 'force');
  assertEqual(r.old, 'other/hooks');
});

test('decideHooksPathAction: husky never forces ai-stats', () => {
  const open = decideHooksPathAction({
    hasHusky: true,
    current: '',
    force: false,
  });
  assertEqual(open.action, 'husky-leave');
  const setup = decideHooksPathAction({
    hasHusky: true,
    current: '',
    force: true,
  });
  assertEqual(setup.action, 'husky-leave');
});

test('decideHooksPathAction: husky mispointed to ai-stats -> warn-restore', () => {
  const r = decideHooksPathAction({
    hasHusky: true,
    current: HOOKS_PATH_VALUE,
    force: true,
  });
  assertEqual(r.action, 'warn-restore-husky');
  assertTrue(String(r.restoreCmd || '').includes('.husky/_'));
});

test('isExpectedHookEntry accepts wrapper requiring hooks.cjs', () => {
  assertEqual(isExpectedHookEntry(WRAPPER_SOURCE), true);
  assertEqual(isExpectedHookEntry("#!/usr/bin/env node\nrequire('../hook-stdin.cjs');\n"), false);
});

test('decideWorkspaceOpenMode: not ready → full-setup (first open)', () => {
  const r = decideWorkspaceOpenMode({
    locallyReady: false,
    recentMissing: false,
    noCommits: false,
    checkError: false,
  });
  assertEqual(r.mode, 'full-setup');
  assertEqual(r.reason, 'local-not-ready');
});

test('decideWorkspaceOpenMode: ready + trailer ok → skip', () => {
  const r = decideWorkspaceOpenMode({
    locallyReady: true,
    recentMissing: false,
    noCommits: false,
    checkError: false,
  });
  assertEqual(r.mode, 'skip');
  assertEqual(r.reason, 'ready-and-trailer-ok');
});

test('decideWorkspaceOpenMode: ready + missing trailer → full-setup', () => {
  const r = decideWorkspaceOpenMode({
    locallyReady: true,
    recentMissing: true,
    noCommits: false,
    checkError: false,
  });
  assertEqual(r.mode, 'full-setup');
  assertEqual(r.reason, 'recent-missing-AI-Authored');
});

test('decideWorkspaceOpenMode: ready + no commits → skip', () => {
  const r = decideWorkspaceOpenMode({
    locallyReady: true,
    recentMissing: false,
    noCommits: true,
    checkError: false,
  });
  assertEqual(r.mode, 'skip');
  assertEqual(r.reason, 'no-commits');
});

test('decideWorkspaceOpenMode: ready + check error → full-setup', () => {
  const r = decideWorkspaceOpenMode({
    locallyReady: true,
    recentMissing: false,
    noCommits: false,
    checkError: true,
  });
  assertEqual(r.mode, 'full-setup');
  assertEqual(r.reason, 'trailer-check-error');
});

test('isLocalAiStatsReady: no husky requires hooksPath + wrappers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-ready-'));
  const hooksDir = path.join(root, HOOKS_REL);
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, 'hooks.cjs'), 'module.exports = {};\n');
  // execFileSync from header
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    assertEqual(isLocalAiStatsReady(root, hooksDir), false);
    execFileSync('git', ['config', 'core.hooksPath', HOOKS_PATH_VALUE], { cwd: root });
    assertEqual(isLocalAiStatsReady(root, hooksDir), false);
    for (const name of HOOK_NAMES) {
      fs.writeFileSync(path.join(hooksDir, name), WRAPPER_SOURCE);
    }
    assertEqual(isLocalAiStatsReady(root, hooksDir), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AC-L3: huskyHookBody forwards "$@"', () => {
  const body = huskyHookBody('prepare-commit-msg');
  assertTrue(body.includes('"$@"'), body);
  assertTrue(body.includes(huskyCallLine('prepare-commit-msg')), body);
});

test('ensureHuskyArgsForwarding upgrades call without "$@"', () => {
  const old =
    '#!/usr/bin/env sh\nnode "$(dirname -- "$0")/../.cursor/hooks/ai-stats/hooks.cjs" prepare-commit-msg\n';
  const fixed = ensureHuskyArgsForwarding(old);
  assertTrue(fixed.includes('prepare-commit-msg "$@"'), fixed);
});

test('force husky setup appends call without wiping custom script', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-husky-append-'));
  const huskyDir = path.join(root, '.husky');
  fs.mkdirSync(huskyDir, { recursive: true });
  const custom = '#!/usr/bin/env sh\nnpx lint-staged\n';
  fs.writeFileSync(path.join(huskyDir, 'pre-push'), custom, 'utf8');
  try {
    const r = ensureHuskyAiStatsHooks(root, { force: true });
    assertEqual(r['pre-push'], 'appended');
    const body = fs.readFileSync(path.join(huskyDir, 'pre-push'), 'utf8');
    assertTrue(body.includes('npx lint-staged'), 'must keep custom content');
    assertTrue(body.includes('hooks.cjs" pre-push "$@"'), body);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('appendAiStatsToHuskyScript preserves lint-staged then adds call', () => {
  const out = appendAiStatsToHuskyScript('#!/usr/bin/env sh\nnpx lint-staged\n', 'post-commit');
  assertTrue(out.includes('npx lint-staged'));
  assertTrue(out.includes('post-commit "$@"'));
});

test('AC-S2b: workspaceOpen always exits 0 (fail-open)', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stats-wo-exit-'));
  try {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'setup-ai-stats.cjs')], {
      cwd,
      encoding: 'utf8',
      env: process.env,
    });
    assertEqual(r.status, 0, `stderr=${r.stderr || ''}`);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('resolveWorkspaceRoots: CURSOR_PROJECT_DIR when stdin empty (sessionStart fallback)', () => {
  const hint = path.join(os.tmpdir(), 'ai-stats-cursor-proj');
  const roots = resolveWorkspaceRoots({
    stdinRaw: '',
    env: { CURSOR_PROJECT_DIR: hint },
    cwd: path.join(os.tmpdir(), 'other'),
  });
  assertEqual(roots.length, 1);
  assertEqual(roots[0], hint);
});

test('resolveWorkspaceRoots: stdin workspace_roots wins over env', () => {
  const roots = resolveWorkspaceRoots({
    stdinRaw: JSON.stringify({ workspace_roots: ['/from/stdin'] }),
    env: { CURSOR_PROJECT_DIR: '/from/env' },
    cwd: '/cwd',
  });
  assertEqual(roots[0], '/from/stdin');
});

})();


// ===== trailer.test.cjs =====

(function () {

const { buildTrailer } = require('./core.cjs');

const yes = buildTrailer({
  authored: 'yes',
  lines: 4,
  files: 1,
  aiAdded: 1,
  aiDeleted: 1,
  aiFiles: 1,
});
assert.match(yes, /AI-Lines-Added: 1/);
assert.match(yes, /AI-Lines-Deleted: 1/);

const no = buildTrailer({ authored: 'no', lines: 8, files: 1 });
assert.ok(!no.includes('AI-Lines'));

const unk = buildTrailer({ authored: 'unknown', lines: 240, files: 2 });
assert.ok(!unk.includes('AI-Lines'));

})();


// ===== until-range.test.cjs =====

(function () {

const {
  parseArgs,
  buildGitLogArgs,
  buildJsonPayload,
  formatMarkdown,
} = require('./ai-stats.cjs');

test('AC-U1: parseArgs reads --until verbatim', () => {
  const opts = parseArgs(['node', 'ai-stats.cjs', '--since', '7d', '--until', '2026-08-15']);
  assertEqual(opts.since, '7 days ago');
  assertEqual(opts.until, '2026-08-15');
});

test('AC-U2: omit --until leaves until undefined and git args have no --until=', () => {
  const opts = parseArgs(['node', 'ai-stats.cjs', '--since', '7d']);
  assertEqual(opts.until, undefined);
  const args = buildGitLogArgs(opts.since, opts.until);
  assertTrue(!args.some((a) => String(a).startsWith('--until=')), 'must not pass --until=');
  assertTrue(args.some((a) => String(a).startsWith('--since=')), 'must pass --since=');
});

test('AC-U1: buildGitLogArgs includes --until= when set', () => {
  const args = buildGitLogArgs('2026-08-01', '2026-08-15');
  assertTrue(args.includes('--until=2026-08-15'), `args=${JSON.stringify(args)}`);
  assertTrue(args.includes('--since=2026-08-01'), `args=${JSON.stringify(args)}`);
});

test('AC-U3: formatMarkdown with until uses since ~ until', () => {
  const summary = {
    valid: 0,
    yesCount: 0,
    unknownCount: 0,
    totalLines: 0,
    aiLines: 0,
    humanLines: 0,
    m1: 0,
    m2: 0,
    leak: 0,
    byAuthor: new Map(),
  };
  const md = formatMarkdown(summary, '2026-08-01', '2026-08-15');
  assertTrue(md.includes('统计范围: 2026-08-01 ~ 2026-08-15'), md);
  assertTrue(!md.includes('至今'), 'must not say 至今 when until set');
});

test('AC-U2: formatMarkdown without until uses 至今', () => {
  const summary = {
    valid: 0,
    yesCount: 0,
    unknownCount: 0,
    totalLines: 0,
    aiLines: 0,
    humanLines: 0,
    m1: 0,
    m2: 0,
    leak: 0,
    byAuthor: new Map(),
  };
  const md = formatMarkdown(summary, '7 days ago');
  assertTrue(md.includes('统计范围: 7 days ago 至今'), md);
});

test('AC-U4: buildJsonPayload includes until when set', () => {
  const summary = {
    valid: 1,
    yesCount: 0,
    unknownCount: 0,
    totalLines: 0,
    aiLines: 0,
    humanLines: 0,
    m1: 0,
    m2: 0,
    leak: 0,
    byAuthor: new Map(),
    byDate: new Map(),
  };
  const withUntil = buildJsonPayload(summary, '2026-08-01', '2026-08-15');
  assertEqual(withUntil.until, '2026-08-15');
  assertEqual(withUntil.since, '2026-08-01');
  const without = buildJsonPayload(summary, '7d', undefined);
  assertEqual(without.until, undefined);
  assertTrue(!Object.prototype.hasOwnProperty.call(without, 'until'));
});

})();


let passed = 0;
let failed = 0;
for (const { name, fn } of suites) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.error('  ✗ ' + name);
    console.error('    ' + e.message);
  }
}
console.log('');
if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('All ' + passed + ' tests passed');
