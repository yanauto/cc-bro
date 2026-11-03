#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -x ui/node_modules/.bin/vite ]; then npm ci --prefix ui --no-audit --no-fund; fi
npm run build --prefix ui
packdir=$(mktemp -d)
trap 'rm -rf "$packdir"' EXIT
npm pack --pack-destination "$packdir" --silent
npm install --global --offline --no-audit --no-fund "$packdir"/*.tgz
"$(npm prefix -g)/bin/cc-bro" setup
