#!/bin/sh
set -eu

app_executable=${TERMDECK_APP_EXECUTABLE:-/Applications/Termdeck.app/Contents/MacOS/termdeck}
bin_dir=${TERMDECK_BIN_DIR:-"$HOME/.local/bin"}

if [ ! -x "$app_executable" ]; then
  printf 'Termdeck app executable not found: %s\n' "$app_executable" >&2
  exit 1
fi

mkdir -p "$bin_dir"
ln -sfn "$app_executable" "$bin_dir/termdeck"
printf 'Installed termdeck to %s/termdeck\n' "$bin_dir"
printf 'Add %s to PATH if needed.\n' "$bin_dir"
