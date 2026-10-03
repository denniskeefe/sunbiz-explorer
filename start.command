#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  uv venv .venv
fi
uv pip install --python .venv/bin/python -r requirements.txt
printf '\nSunbiz Explorer: http://127.0.0.1:8765\nLeave this window open. Press Control-C to stop.\n\n'
exec env -u PYTHONPATH .venv/bin/python -m uvicorn backend:app --host 127.0.0.1 --port 8765
