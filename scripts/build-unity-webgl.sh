#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unity_editor="${UNITY_EDITOR:-$root_dir/.local-tools/Unity/Hub/Editor/2022.3.48f1/Editor/Unity}"

export UPM_CACHE_ROOT="$root_dir/.local-tools/unity-upm-cache"
export UPM_NPM_CACHE_PATH="$UPM_CACHE_ROOT/npm"
export UPM_CACHE_PATH="$UPM_CACHE_ROOT/packages"
export UPM_GIT_LFS_CACHE_PATH="$UPM_CACHE_ROOT/git-lfs"
export XDG_CONFIG_HOME="$root_dir/.local-tools/unity-editor-config"
export XDG_DATA_HOME="$root_dir/.local-tools/unity-editor-data"
export XDG_CACHE_HOME="$root_dir/.local-tools/unity-editor-cache"
export CAMPAIGN1934_WEBGL_OUTPUT="$root_dir/public/unity"

"$unity_editor" -batchmode -nographics -quit \
  -projectPath "$root_dir/unity/Campaign1934" \
  -executeMethod Campaign1934.Editor.ProjectBootstrap.BuildWebGLSmokeTest \
  -logFile "$root_dir/.local-tools/unity-webgl-build.log"
