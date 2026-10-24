#!/bin/bash
set -e

if ! command -v pnpm >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  corepack enable --install-directory "$HOME/.local/bin" pnpm
  export PATH="$HOME/.local/bin:$PATH"
fi

if [ ! -d "node_modules" ]; then
  pnpm install
fi

pnpm start

