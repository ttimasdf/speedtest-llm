#!/usr/bin/env bash

MODEL="$1"
THREADS=50

if [ -z "$MODEL" ]; then
    echo "usage: $0 <model>"
    exit 1
fi

set -x

bun run ./src/index.ts run -m fresh -u "$LLM_BASE_URL" -M "$MODEL" --threads "$THREADS" --timeout 20 --omit 10 --verbose --trace-output file --trace-file "results/$MODEL.traces.jsonl" 2>&1 | tee "results/$MODEL.speedtest-run.txt"
