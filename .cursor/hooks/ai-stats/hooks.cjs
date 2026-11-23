#!/usr/bin/env node
'use strict';

const path = require('path');
const core = require('./core.cjs');

function resolveGitHookName(argv) {
  for (let i = 0; i < Math.min(argv.length, 4); i++) {
    const base = path.basename(String(argv[i] || ''));
    if (/^prepare-commit-msg$/i.test(base)) return 'prepare-commit-msg';
    if (/^post-commit$/i.test(base)) return 'post-commit';
    if (/^pre-push$/i.test(base)) return 'pre-push';
  }
  return null;
}

function main() {
  const gitHook = resolveGitHookName(process.argv);
  if (gitHook === 'prepare-commit-msg') {
    // Husky: `node hooks.cjs prepare-commit-msg "$@"` — drop the hook-name token
    // so core does not treat it as COMMIT_EDITMSG (周灵2 ENOENT).
    const argv = process.argv
      .slice(2)
      .filter((a) => !core.isGitHookArgName(a));
    core.runPrepareCommitMsg(argv);
    return;
  }
  if (gitHook === 'post-commit') {
    core.runPostCommit();
    return;
  }
  if (gitHook === 'pre-push') {
    let code = 0;
    try {
      const r = core.runPrePush();
      if (r && typeof r.exitCode === 'number') code = r.exitCode;
    } catch {
      /* fail-open for unexpected errors */
      code = 0;
    }
    process.exit(code);
  }
  if (require.main === module) {
    try {
      const payload = core.parseHookStdinJson();
      if (!core.isUsefulHookPayload(payload)) {
        // Cursor 偶发未把 JSON 写入 stdin（Windows 管道）；无法归因，勿 silently 当成功采集
        console.error('[ai-stats] cursor hook warning: empty stdin payload');
      } else if (/afterShellExecution/i.test(String(payload.hook_event_name || ''))) {
        // Matcher already narrows to git commit; remediate then warn; never block Cursor.
        try {
          core.tryAutoRemediateHead({ source: 'afterShellExecution' });
        } catch {
          /* fail-open */
        }
        core.warnIfMissingTrailer({ scope: 'commit' });
      } else {
        core.runCursorHook(payload);
      }
    } catch (e) {
      console.error('[ai-stats] cursor hook error:', e.message);
    }
    process.exit(0);
  }
}

main();

module.exports = { resolveGitHookName };
