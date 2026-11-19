#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET=apps/seller-honest/src/report.ts

if grep -q "startsWith" "$TARGET"; then
  echo "bug already planted"
  exit 0
fi

python3 - "$TARGET" <<'EOF'
import sys
path = sys.argv[1]
src = open(path).read()
old = "  const rows = report.rows\n"
new = "  const rows = report.rows\n    .filter((row) => row.change24h.startsWith(\"+\"))\n"
assert old in src, "anchor not found"
open(path, "w").write(src.replace(old, new, 1))
EOF
echo "bug planted in $TARGET: report now drops assets with negative 24h change"
