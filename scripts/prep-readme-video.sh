#!/usr/bin/env bash
# Trim + downsize a Quest screen recording into a README-friendly inline clip.
#
# Inputs are typically raw captures from the Quest's built-in recorder
# (or scrcpy / Meta companion app), which ship at 1080p+, 30 fps, and
# carry a few seconds of fumbling at start/end. GitHub's inline-video
# CDN happily serves up to ~10 MB but smaller is friendlier on mobile,
# so this re-encodes to a tight H.264 mp4: 720p wide, 24 fps, CRF 28,
# audio stripped, faststart for streaming-while-decoding.
#
# Usage:
#   scripts/prep-readme-video.sh <input.mp4> [start] [end] [output.mp4]
#
#   start, end : ffmpeg -ss / -to time specs (e.g. "2", "0:00:02.5",
#                "00:00:12"). Pass "0" for start to keep the head;
#                pass "" for end to keep the tail.
#   output     : defaults to <input-stem>.readme.mp4 next to the input.
#
# Examples:
#   scripts/prep-readme-video.sh ~/Downloads/quest-cap.mp4 3 13
#       → trims to seconds 3..13, writes ~/Downloads/quest-cap.readme.mp4
#   scripts/prep-readme-video.sh ~/Downloads/quest-cap.mp4 0 "" out.mp4
#       → keeps the full clip, just downsizes
#
# After running, drag-drop the output onto a PR or issue comment box on
# GitHub — that hosts it on github.com/user-attachments/assets/<uuid>,
# the only URL form that inline-plays in README per the workspace
# `reference_github_readme_video` memory.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <input.mp4> [start] [end] [output.mp4]" >&2
  exit 2
fi

INPUT=$1
START=${2:-0}
END=${3:-}
OUTPUT=${4:-${INPUT%.*}.readme.mp4}

if [[ ! -f $INPUT ]]; then
  echo "error: input not found: $INPUT" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "error: ffmpeg not found on PATH (try: brew install ffmpeg)" >&2
  exit 1
fi

# -ss before -i would be faster but seeks to the nearest keyframe, which
# can chop a half-second off the front. Putting -ss after -i is slower
# but frame-accurate — fine for ~10 s clips.
TRIM_ARGS=(-ss "$START")
if [[ -n $END ]]; then
  TRIM_ARGS+=(-to "$END")
fi

# scale=720:-2 keeps aspect ratio, rounds height to even (libx264 needs
# mod-2 dimensions). yuv420p for max browser compat.
ffmpeg -hide_banner -y \
  -i "$INPUT" \
  "${TRIM_ARGS[@]}" \
  -vf "scale=720:-2,fps=24,format=yuv420p" \
  -c:v libx264 -crf 28 -preset slow \
  -movflags +faststart \
  -an \
  "$OUTPUT"

# Report final size — handy for the < 10 MB inline-video target.
SIZE=$(du -h "$OUTPUT" | cut -f1)
echo
echo "wrote $OUTPUT ($SIZE)"
echo "next: drag-drop onto a PR/issue comment, copy the user-attachments URL into README.md"
