#!/usr/bin/env node
'use strict';

/**
 * Unique Node entry for ai-stats ops (§5 / §5.2.1 / §6.2 / §6.3):
 * - workspaceOpen / sessionStart (default): first-open / missing trailer → full setup; ready+ok → skip; always exit 0
 *   sessionStart is a fallback: Cursor may request workspaceOpen without spawning the command.
 * - --setup: force (no Husky) / Husky-safe install + full diagnostics + smoke (non-zero on fail)
 *
 * Replaces ensure-hooks-path.cjs.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const HOOKS_REL = '.cursor/hooks/ai-stats';
const HOOKS_PATH_VALUE = '.cursor/hooks/ai-stats';
const HOOK_NAMES = ['prepare-commit-msg', 'post-commit', 'pre-push'];
const WRAPPER_SOURCE =
  "#!/usr/bin/env node\n'use strict';\nrequire('./hooks.cjs');\n";
const HUSKY_CALL_MARKER = 'hooks/ai-stats/hooks.cjs';

function findRepoRoot(start) {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function hasHuskyDir(repoRoot) {
  try {
    return fs.statSync(path.join(repoRoot, '.husky')).isDirectory();
  } catch {
    return false;
  }
}

function normalizeHooksPath(raw) {
  return String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
}

function isDesiredHooksPath(raw, repoRoot) {
  const n = normalizeHooksPath(raw);
  if (!n) return false;
  if (n === HOOKS_PATH_VALUE) return true;
  if (!repoRoot) return false;
  try {
    return path.resolve(repoRoot, n) === path.resolve(repoRoot, HOOKS_REL);
  } catch {
    return false;
  }
}

/**
 * Pure policy for core.hooksPath (§5.2 / §6.3).
 * @returns {{ action: string, current?: string, old?: string, restoreCmd?: string }}
 */
function decideHooksPathAction({ hasHusky, current, force }) {
  const cur = String(current || '');
  if (hasHusky) {
    if (isDesiredHooksPath(cur, null) || normalizeHooksPath(cur) === HOOKS_PATH_VALUE) {
      return {
        action: 'warn-restore-husky',
        current: cur,
        restoreCmd: 'git config --local core.hooksPath .husky/_',
      };
    }
    return { action: 'husky-leave', current: cur };
  }
  if (isDesiredHooksPath(cur, null) || normalizeHooksPath(cur) === HOOKS_PATH_VALUE) {
    return { action: 'ok', current: cur };
  }
  if (!cur) return { action: 'set' };
  if (force) return { action: 'force', old: cur };
  return { action: 'skip-custom', current: cur };
}

function getHooksPath(repoRoot) {
  try {
    return execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function setHooksPath(repoRoot, value) {
  execFileSync('git', ['config', '--local', 'core.hooksPath', value], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function isExpectedHookEntry(source) {
  const s = String(source || '');
  return /require\s*\(\s*['"]\.\/hooks\.cjs['"]\s*\)/.test(s);
}

function writeWrapper(dest) {
  fs.writeFileSync(dest, WRAPPER_SOURCE, 'utf8');
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    // Windows may ignore mode
  }
}

function ensureHookEntry(hooksDir, name, { force }) {
  const dest = path.join(hooksDir, name);
  let existing = '';
  if (fs.existsSync(dest)) {
    try {
      existing = fs.readFileSync(dest, 'utf8');
    } catch {
      existing = '';
    }
    if (!force && isExpectedHookEntry(existing)) return 'ok';
  } else if (!force) {
    writeWrapper(dest);
    return 'wrapper';
  }
  writeWrapper(dest);
  if (force) return existing ? 'rebuilt' : 'created';
  return existing ? 'refreshed' : 'wrapper';
}

function huskyScriptCallsAiStats(content) {
  const s = String(content || '');
  return (
    s.includes(HUSKY_CALL_MARKER) ||
    /node\s+[^\n]*hooks\/ai-stats\/hooks\.cjs/.test(s) ||
    /node\s+[^\n]*\.cursor\/hooks\/ai-stats\/hooks\.cjs/.test(s)
  );
}

function huskyCallLine(hookName) {
  // Must forward "$@" so prepare-commit-msg receives COMMIT_EDITMSG ($1).
  return `node "$(dirname -- "$0")/../.cursor/hooks/ai-stats/hooks.cjs" ${hookName} "$@"`;
}

function huskyHookBody(hookName) {
  return [
    '#!/usr/bin/env sh',
    '. "$(dirname -- "$0")/_/husky.sh"',
    '',
    huskyCallLine(hookName),
    '',
  ].join('\n');
}

/** Ensure ai-stats husky call lines forward Git hook args ("$@"). */
function ensureHuskyArgsForwarding(content) {
  return String(content || '').replace(
    /(node\s+[^\n]*[/\\]hooks\/ai-stats\/hooks\.cjs["']?\s+(?:prepare-commit-msg|post-commit|pre-push))(?!\s+"\$@")/g,
    '$1 "$@"'
  );
}

/**
 * Install ai-stats into a husky script without wiping custom hooks (lint-staged etc.).
 * force + custom: append call line; never replace whole file when content already exists.
 */
function appendAiStatsToHuskyScript(existing, hookName) {
  let body = String(existing || '');
  if (!body.trim()) return huskyHookBody(hookName);
  if (huskyScriptCallsAiStats(body)) return ensureHuskyArgsForwarding(body);
  if (!body.endsWith('\n')) body += '\n';
  return body + '\n' + huskyCallLine(hookName) + '\n';
}

function ensureHuskyAiStatsHooks(repoRoot, { force }) {
  const huskyDir = path.join(repoRoot, '.husky');
  const result = {};
  for (const name of ['prepare-commit-msg', 'post-commit', 'pre-push']) {
    const dest = path.join(huskyDir, name);
    let existing = '';
    if (fs.existsSync(dest)) {
      try {
        existing = fs.readFileSync(dest, 'utf8');
      } catch {
        existing = '';
      }
      if (huskyScriptCallsAiStats(existing)) {
        const fixed = ensureHuskyArgsForwarding(existing);
        if (fixed !== existing) {
          fs.writeFileSync(dest, fixed, 'utf8');
          result[name] = 'args-fixed';
        } else {
          result[name] = 'ok';
        }
        continue;
      }
      if (!force) {
        result[name] = 'skip-custom';
        continue;
      }
    } else if (!force) {
      result[name] = 'missing';
      continue;
    }
    const next = existing
      ? appendAiStatsToHuskyScript(existing, name)
      : huskyHookBody(name);
    fs.writeFileSync(dest, next, 'utf8');
    try {
      fs.chmodSync(dest, 0o755);
    } catch {
      // ignore
    }
    result[name] = existing ? 'appended' : 'created';
  }
  return result;
}

function applyHooksPath(repoRoot, decision) {
  if (decision.action === 'set' || decision.action === 'force') {
    setHooksPath(repoRoot, HOOKS_PATH_VALUE);
  }
  return decision;
}

function runPrune(repoRoot) {
  try {
    const core = require(path.join(repoRoot, HOOKS_REL, 'core.cjs'));
    if (typeof core.pruneActiveTrace !== 'function') {
      return { kept: 0, removed: 0, error: 'no-pruneActiveTrace' };
    }
    return core.pruneActiveTrace();
  } catch (e) {
    return { kept: 0, removed: 0, error: e.message };
  }
}

/**
 * Resolve workspace roots for Cursor lifecycle hooks.
 * Prefer stdin `workspace_roots` (workspaceOpen); then CURSOR_PROJECT_DIR / CLAUDE_PROJECT_DIR
 * (sessionStart has no workspace_roots); finally cwd.
 * @param {{ stdinRaw?: string, env?: NodeJS.ProcessEnv, cwd?: string }} [opts]
 */
function resolveWorkspaceRoots(opts = {}) {
  const env = opts.env || process.env;
  const cwd = opts.cwd || process.cwd();
  let raw = typeof opts.stdinRaw === 'string' ? opts.stdinRaw : null;
  if (raw === null) {
    try {
      raw = fs.readFileSync(0, 'utf8');
    } catch {
      raw = '';
    }
  }
  if (String(raw || '').trim()) {
    try {
      const payload = JSON.parse(raw);
      if (Array.isArray(payload.workspace_roots) && payload.workspace_roots.length) {
        return payload.workspace_roots;
      }
    } catch {
      // fall through
    }
  }
  const fromEnv = String(env.CURSOR_PROJECT_DIR || env.CLAUDE_PROJECT_DIR || '').trim();
  if (fromEnv) return [fromEnv];
  return [cwd];
}

function readWorkspaceRoots(env = process.env) {
  return resolveWorkspaceRoots({ env });
}

function normalizeRootHint(raw) {
  return String(raw || '')
    .replace(/^\/([a-zA-Z]):\//, '$1:/')
    .replace(/\//g, path.sep);
}

function nodeAvailable() {
  try {
    const v = execFileSync('node', ['-v'], { encoding: 'utf8' }).trim();
    return { ok: true, detail: v };
  } catch (e) {
    return { ok: false, detail: e.message, fix: 'Install Node 18+ and add it to PATH' };
  }
}

function checkExcludeJson(hooksDir) {
  const fp = path.join(hooksDir, 'ai-stats.exclude.json');
  if (!fs.existsSync(fp)) {
    return { ok: false, detail: 'missing', fix: 'Restore ai-stats.exclude.json from repo template' };
  }
  try {
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (typeof j.excludePaths !== 'string') {
      return {
        ok: false,
        detail: 'excludePaths not a string',
        fix: 'Fix JSON: excludePaths must be a comma-separated string',
      };
    }
    return { ok: true, detail: 'ok' };
  } catch (e) {
    return { ok: false, detail: e.message, fix: 'Fix JSON syntax / excludePaths string' };
  }
}

function checkTraceWritable(hooksDir) {
  const traceDir = path.join(hooksDir, 'trace');
  try {
    fs.mkdirSync(traceDir, { recursive: true });
    const probe = path.join(traceDir, '.setup-write-probe');
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return { ok: true, detail: 'writable' };
  } catch (e) {
    return { ok: false, detail: e.message, fix: 'Check permissions and disk space for trace/' };
  }
}

function recentNonMergeHasAiAuthored(repoRoot) {
  try {
    const sha = execFileSync(
      'git',
      ['log', '-1', '--no-merges', '--format=%H'],
      { cwd: repoRoot, encoding: 'utf8' }
    ).trim();
    if (!sha) {
      return { ok: true, detail: 'no commits', missing: false, noCommits: true };
    }
    const body = execFileSync('git', ['log', '-1', '--format=%B', sha], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const has = /^AI-Authored:\s*/m.test(body);
    return {
      ok: has,
      detail: has ? 'present' : 'missing',
      missing: !has,
      noCommits: false,
      sha,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e.message,
      missing: false,
      noCommits: false,
      checkError: true,
    };
  }
}

/**
 * Pure policy for workspaceOpen (§5.2.1).
 * @returns {{ mode: 'full-setup'|'skip', reason: string }}
 */
function decideWorkspaceOpenMode({ locallyReady, recentMissing, noCommits, checkError }) {
  if (!locallyReady) {
    return { mode: 'full-setup', reason: 'local-not-ready' };
  }
  if (checkError) {
    return { mode: 'full-setup', reason: 'trailer-check-error' };
  }
  if (noCommits) {
    return { mode: 'skip', reason: 'no-commits' };
  }
  if (recentMissing) {
    return { mode: 'full-setup', reason: 'recent-missing-AI-Authored' };
  }
  return { mode: 'skip', reason: 'ready-and-trailer-ok' };
}

/** Whether this machine's hooksPath + entries look ready for ai-stats. */
function isLocalAiStatsReady(repoRoot, hooksDir) {
  if (!fs.existsSync(path.join(hooksDir, 'hooks.cjs'))) return false;
  const hasHusky = hasHuskyDir(repoRoot);
  const current = getHooksPath(repoRoot);

  if (hasHusky) {
    if (isDesiredHooksPath(current, repoRoot) || normalizeHooksPath(current) === HOOKS_PATH_VALUE) {
      return false;
    }
    for (const name of HOOK_NAMES) {
      const huskyFile = path.join(repoRoot, '.husky', name);
      if (!fs.existsSync(huskyFile)) return false;
      let body = '';
      try {
        body = fs.readFileSync(huskyFile, 'utf8');
      } catch {
        return false;
      }
      if (!huskyScriptCallsAiStats(body)) return false;
    }
    return true;
  }

  if (!isDesiredHooksPath(current, repoRoot)) return false;
  for (const name of HOOK_NAMES) {
    const dest = path.join(hooksDir, name);
    if (!fs.existsSync(dest)) return false;
    let body = '';
    try {
      body = fs.readFileSync(dest, 'utf8');
    } catch {
      return false;
    }
    if (!isExpectedHookEntry(body)) return false;
  }
  return true;
}

function detectBareHardlinkEsmRisk(hooksDir, repoRoot) {
  const pkgPath = path.join(repoRoot, 'package.json');
  let typeModule = false;
  if (fs.existsSync(pkgPath)) {
    try {
      typeModule = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).type === 'module';
    } catch {
      typeModule = false;
    }
  }
  const risks = [];
  const hooksCjs = path.join(hooksDir, 'hooks.cjs');
  let hooksIno = null;
  try {
    hooksIno = fs.statSync(hooksCjs).ino;
  } catch {
    hooksIno = null;
  }
  for (const name of HOOK_NAMES) {
    const dest = path.join(hooksDir, name);
    if (!fs.existsSync(dest)) continue;
    try {
      const st = fs.statSync(dest);
      const body = fs.readFileSync(dest, 'utf8');
      if (hooksIno != null && st.ino === hooksIno && !isExpectedHookEntry(body)) {
        risks.push(name);
      } else if (typeModule && !isExpectedHookEntry(body) && !/\.cjs\b/.test(body)) {
        // extensionless entry that is not a require('./hooks.cjs') wrapper
        if (!body.includes('hooks.cjs')) risks.push(name);
      }
    } catch {
      // ignore
    }
  }
  return { typeModule, risks };
}

function printDiag(name, item) {
  const status = item.ok ? 'OK' : 'FAIL';
  console.log(`[${status}] ${name}: ${item.detail || ''}`);
  if (!item.ok && item.fix) {
    console.log(`       fix: ${item.fix}`);
  }
}

function printScmGuidance() {
  console.log('');
  console.log('[ai-stats] Cursor SCM may skip Git hooks (core.hooksPath=nul /dev/null).');
  console.log('  Workaround: commit from the integrated terminal: git add && git commit -m "..."');
  console.log('  If already committed via SCM and not pushed: git commit --amend --no-edit');
  console.log('  Then: git log -1 --format="%B"  (expect AI-Authored:)');
  console.log('  This is a Cursor product bug; ai-stats cannot fix hooks that never run.');
}

function runSmokeTests(hooksDir) {
  const runner = path.join(hooksDir, 'run-tests.cjs');
  if (!fs.existsSync(runner)) {
    console.log('[SKIP] run-tests.cjs not found — smoke tests skipped (not a config failure)');
    return { ok: true, skipped: true };
  }
  console.log('[RUN] node run-tests.cjs');
  const r = spawnSync(process.execPath, [runner], {
    cwd: hooksDir,
    encoding: 'utf8',
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error('[FAIL] smoke tests failed — exit non-zero');
    return { ok: false, skipped: false };
  }
  console.log('[OK] smoke tests passed');
  return { ok: true, skipped: false };
}

function diagnose(repoRoot, hooksDir, hasHusky, hooksPathDecision, entries) {
  let failed = 0;

  const node = nodeAvailable();
  printDiag('node available', node);
  if (!node.ok) failed++;

  printDiag('git repo root', {
    ok: true,
    detail: repoRoot,
  });

  const hooksCjs = fs.existsSync(path.join(hooksDir, 'hooks.cjs'));
  const coreCjs = fs.existsSync(path.join(hooksDir, 'core.cjs'));
  printDiag('hooks.cjs / core.cjs', {
    ok: hooksCjs && coreCjs,
    detail: `hooks.cjs=${hooksCjs} core.cjs=${coreCjs}`,
    fix: 'Confirm the repo includes ai-stats, or pull latest',
  });
  if (!(hooksCjs && coreCjs)) failed++;

  const current = getHooksPath(repoRoot);
  let hooksPathOk = false;
  let hooksPathDetail = `current=${current || '(unset)'} husky=${hasHusky}`;
  let hooksPathFix = '';
  if (hasHusky) {
    if (isDesiredHooksPath(current, repoRoot)) {
      hooksPathOk = false;
      hooksPathFix =
        'Mispointed to ai-stats while .husky exists. Restore: git config --local core.hooksPath .husky/_';
    } else {
      hooksPathOk = true;
      hooksPathDetail += ' (Husky mode: do not set hooksPath to ai-stats)';
    }
  } else {
    hooksPathOk = isDesiredHooksPath(current, repoRoot);
    if (!hooksPathOk) {
      hooksPathFix = `Set: git config --local core.hooksPath ${HOOKS_PATH_VALUE}`;
    }
  }
  printDiag('core.hooksPath matches repo type', {
    ok: hooksPathOk,
    detail: hooksPathDetail,
    fix: hooksPathFix,
  });
  if (!hooksPathOk) failed++;

  if (hooksPathDecision.action === 'warn-restore-husky') {
    console.log(
      `[WARN] hooksPath points at ai-stats but .husky exists. Restore with: ${hooksPathDecision.restoreCmd}`
    );
  }
  if (hooksPathDecision.action === 'force' && hooksPathDecision.old) {
    console.log(`[INFO] forced hooksPath ${hooksPathDecision.old} -> ${HOOKS_PATH_VALUE}`);
  }

  const trailer = recentNonMergeHasAiAuthored(repoRoot);
  if (trailer.missing) {
    console.log(
      `[WARN] recent non-merge commit has AI-Authored: missing` +
        (trailer.sha ? ` sha=${trailer.sha.slice(0, 8)}` : '')
    );
    console.log(
      '       fix: May be Cursor SCM bypass (§6.2) or wrong hooksPath (§6.3). Prefer terminal commits; or amend --no-edit if not pushed.'
    );
    printScmGuidance();
    // informational — do not count as hard fail for setup success (AC-Z1)
  } else {
    printDiag('recent non-merge commit has AI-Authored', {
      ok: true,
      detail: trailer.detail + (trailer.sha ? ` sha=${trailer.sha.slice(0, 8)}` : ''),
    });
  }

  for (const name of HOOK_NAMES) {
    const st = entries[name] || 'unknown';
    let ok = true;
    let detail = st;
    let fix = '';
    if (hasHusky) {
      const huskyFile = path.join(repoRoot, '.husky', name);
      if (!fs.existsSync(huskyFile)) {
        ok = false;
        detail = 'missing under .husky';
        fix = `Ensure .husky/${name} runs: node .cursor/hooks/ai-stats/hooks.cjs`;
      } else {
        const body = fs.readFileSync(huskyFile, 'utf8');
        ok = huskyScriptCallsAiStats(body);
        detail = ok ? 'husky -> hooks.cjs' : 'husky script does not call ai-stats hooks.cjs';
        fix = ok
          ? ''
          : `Update .husky/${name} to invoke node .../hooks.cjs (avoid extensionless hardlink)`;
      }
    } else {
      const dest = path.join(hooksDir, name);
      if (!fs.existsSync(dest)) {
        ok = false;
        detail = 'missing';
        fix = 'Re-run setup to create wrapper entries';
      } else {
        const body = fs.readFileSync(dest, 'utf8');
        ok = isExpectedHookEntry(body);
        detail = ok ? 'wrapper -> hooks.cjs' : 'unexpected entry content';
        fix = ok ? '' : 'Rebuild with setup --setup (prefer require("./hooks.cjs") wrapper)';
      }
    }
    printDiag(`hook entry ${name}`, { ok, detail, fix });
    if (!ok) failed++;
  }

  const esm = detectBareHardlinkEsmRisk(hooksDir, repoRoot);
  if (esm.risks.length) {
    printDiag('extensionless hardlink + type:module risk', {
      ok: false,
      detail: `risky entries: ${esm.risks.join(',')} type:module=${esm.typeModule}`,
      fix: 'Use wrapper requiring hooks.cjs, or call via Husky; do not hardlink extensionless to hooks.cjs in type:module repos',
    });
    failed++;
  } else {
    printDiag('extensionless hardlink + type:module risk', {
      ok: true,
      detail: 'none detected',
    });
  }

  const excl = checkExcludeJson(hooksDir);
  printDiag('ai-stats.exclude.json', excl);
  if (!excl.ok) failed++;

  const tw = checkTraceWritable(hooksDir);
  printDiag('trace/ writable', tw);
  if (!tw.ok) failed++;

  try {
    const core = require(path.join(hooksDir, 'core.cjs'));
    const ok =
      typeof core.pruneActiveTrace === 'function' &&
      typeof core.runPrepareCommitMsg === 'function';
    printDiag('require(core.cjs) exports', {
      ok,
      detail: ok ? 'ok' : 'missing expected exports',
      fix: 'Pull latest ai-stats core.cjs',
    });
    if (!ok) failed++;
  } catch (e) {
    printDiag('require(core.cjs) exports', {
      ok: false,
      detail: e.message,
      fix: 'Pull latest ai-stats core.cjs',
    });
    failed++;
  }

  return failed;
}

function processRepo(repoRoot, { force }) {
  const hooksDir = path.join(repoRoot, HOOKS_REL);
  const hooksCjs = path.join(hooksDir, 'hooks.cjs');
  if (!fs.existsSync(hooksCjs)) {
    return { skipped: true, reason: 'no-ai-stats' };
  }

  const hasHusky = hasHuskyDir(repoRoot);
  const current = getHooksPath(repoRoot);
  const decision = decideHooksPathAction({
    hasHusky,
    current,
    force,
  });
  // Re-check with repoRoot for path resolve variants
  if (
    !hasHusky &&
    decision.action === 'skip-custom' &&
    isDesiredHooksPath(current, repoRoot)
  ) {
    decision.action = 'ok';
  }
  if (
    hasHusky &&
    isDesiredHooksPath(current, repoRoot) &&
    decision.action !== 'warn-restore-husky'
  ) {
    decision.action = 'warn-restore-husky';
    decision.restoreCmd = 'git config --local core.hooksPath .husky/_';
    decision.current = current;
  }

  applyHooksPath(repoRoot, decision);

  let entries = {};
  let huskyEntries = null;
  if (hasHusky) {
    huskyEntries = ensureHuskyAiStatsHooks(repoRoot, { force });
    entries = huskyEntries;
  } else {
    for (const name of HOOK_NAMES) {
      entries[name] = ensureHookEntry(hooksDir, name, { force });
    }
  }

  const prune = runPrune(repoRoot);

  return {
    skipped: false,
    repoRoot,
    hasHusky,
    decision,
    entries,
    huskyEntries,
    prune,
    hooksDir,
    currentAfter: getHooksPath(repoRoot),
  };
}

function runFullSetupOnRepo(repoRoot, { failOpen }) {
  console.log(`[ai-stats] full setup repoRoot=${repoRoot} failOpen=${!!failOpen}`);
  const result = processRepo(repoRoot, { force: true });
  if (result.skipped) {
    console.error(`[ai-stats] ERROR: ${result.reason} (missing hooks.cjs under ${HOOKS_REL})`);
    return { ok: false, skipped: true };
  }

  if (result.decision.action === 'force' && result.decision.old) {
    console.log(`[ai-stats] hooksPath forced: "${result.decision.old}" -> "${HOOKS_PATH_VALUE}"`);
  }
  if (result.decision.action === 'warn-restore-husky') {
    console.log(
      `[ai-stats] WARN: .husky present but hooksPath is ai-stats. Restore: ${result.decision.restoreCmd}`
    );
  }
  if (result.prune && !result.prune.error) {
    console.log(`[ai-stats] prune: removed=${result.prune.removed} kept=${result.prune.kept}`);
  } else if (result.prune && result.prune.error) {
    console.log(`[ai-stats] prune: fail-open (${result.prune.error})`);
  }

  console.log('');
  console.log('=== diagnostics (§5.3 / §6.2 / §6.3) ===');
  const failCount = diagnose(
    repoRoot,
    result.hooksDir,
    result.hasHusky,
    result.decision,
    result.entries
  );

  console.log('');
  console.log('=== smoke (§5.4) ===');
  const smoke = runSmokeTests(result.hooksDir);

  const ok = failCount === 0 && smoke.ok;
  if (!ok) {
    console.error(
      `[ai-stats] setup finished with failures` +
        (failOpen ? ' (workspaceOpen fail-open: still exit 0)' : '')
    );
  } else {
    console.log('[ai-stats] setup OK');
  }
  return { ok, skipped: false, failCount, smoke };
}

function runWorkspaceOpen() {
  try {
    const roots = readWorkspaceRoots();
    const seen = new Set();
    let handled = false;

    const handle = (repo) => {
      if (!repo || seen.has(repo)) return;
      seen.add(repo);
      const hooksDir = path.join(repo, HOOKS_REL);
      if (!fs.existsSync(path.join(hooksDir, 'hooks.cjs'))) {
        console.error(`[ai-stats] workspaceOpen skip: no ai-stats at ${hooksDir}`);
        return;
      }

      const locallyReady = isLocalAiStatsReady(repo, hooksDir);
      const trailer = recentNonMergeHasAiAuthored(repo);
      const decision = decideWorkspaceOpenMode({
        locallyReady,
        recentMissing: !!trailer.missing,
        noCommits: !!trailer.noCommits,
        checkError: !!trailer.checkError,
      });

      console.error(
        `[ai-stats] workspaceOpen: ${repo} ready=${locallyReady} trailer=${trailer.detail} → ${decision.mode} (${decision.reason})`
      );

      if (decision.mode === 'skip') {
        handled = true;
        return;
      }

      runFullSetupOnRepo(repo, { failOpen: true });
      handled = true;
    };

    for (const root of roots) {
      handle(findRepoRoot(normalizeRootHint(root)));
    }
    if (!handled) {
      handle(findRepoRoot(process.cwd()));
    }
  } catch (e) {
    console.error('[ai-stats] setup-ai-stats (workspaceOpen) failed:', e.message);
  }
  process.exit(0);
}

function runSetup() {
  const startPoints = [__dirname, process.cwd()];
  let repoRoot = null;
  for (const s of startPoints) {
    repoRoot = findRepoRoot(s);
    if (repoRoot) break;
  }
  if (!repoRoot) {
    console.error('[ai-stats] ERROR: could not find a git repository (.git).');
    console.error(
      '  Place/run this script inside the repo (e.g. .cursor/hooks/ai-stats/) or cd to the repo root.'
    );
    process.exit(1);
  }

  console.log(`[ai-stats] --setup repoRoot=${repoRoot}`);
  const result = runFullSetupOnRepo(repoRoot, { failOpen: false });
  if (result.skipped || !result.ok) {
    process.exit(1);
  }
  process.exit(0);
}

function main() {
  const force = process.argv.includes('--setup');
  if (force) runSetup();
  else runWorkspaceOpen();
}

if (require.main === module) {
  main();
}

module.exports = {
  findRepoRoot,
  hasHuskyDir,
  decideHooksPathAction,
  decideWorkspaceOpenMode,
  isLocalAiStatsReady,
  isDesiredHooksPath,
  isExpectedHookEntry,
  normalizeHooksPath,
  readWorkspaceRoots,
  resolveWorkspaceRoots,
  HOOKS_PATH_VALUE,
  HOOKS_REL,
  HOOK_NAMES,
  WRAPPER_SOURCE,
  ensureHookEntry,
  ensureHuskyAiStatsHooks,
  huskyHookBody,
  huskyCallLine,
  ensureHuskyArgsForwarding,
  appendAiStatsToHuskyScript,
  processRepo,
};
