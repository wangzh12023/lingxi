#!/usr/bin/env bash
# Brings the raw screen recording back to real-time speed and re-encodes it.
# Usage: bash scripts/finish-demo.sh <videoDir> <out.mp4>     (run from lingxi/)
set -euo pipefail
dir="${1:-.scratch/video}"
out="${2:-.scratch/video/demo.mp4}"
case "$out" in /*|?:*) ;; *) out="$PWD/$out" ;; esac
# The recorder writes one frame per repaint at a nominal 30 fps, so the raw file can run slightly slower
# or faster than real time. Stretch it back to the wall-clock length. (Captions are drawn in the page.)
secs=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dir/demo-raw.mp4")
wall=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$dir/captions.json','utf8')).wallMs/1000)")
k=$(node -e "console.log(($secs/$wall).toFixed(5))")
echo "raw ${secs}s, wall ${wall}s, speed factor ${k}"
ffmpeg -y -loglevel error -i "$dir/demo-raw.mp4" -vf "setpts=PTS/${k},fps=30" -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -movflags +faststart -an "$out"
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$out"
