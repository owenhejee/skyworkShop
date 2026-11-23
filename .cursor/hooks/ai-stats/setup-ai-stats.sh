#!/usr/bin/env sh
set -e
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
node "$DIR/setup-ai-stats.cjs" --setup
exit $?
