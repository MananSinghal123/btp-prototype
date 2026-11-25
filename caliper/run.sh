#!/usr/bin/env bash
# Runs the whole MEVRES Caliper benchmark from this folder:
#   compile -> smoke test -> gas scaling -> local Hardhat node -> Caliper (latency, throughput)
# Results land in results/. Needs Node 18+ and `npm install` followed by
# `npx caliper bind --caliper-bind-sut ethereum:1.3` (see README.md).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p results

node scripts/compile.js
node scripts/smoke-test.js
node scripts/gas-scaling.js | tee results/gas-scaling.md

run_caliper() {  # $1 = benchmark config, $2 = report name, $3 = block time in ms (0 = automine)
  # run the node binary directly so $! is the node itself, not an npx wrapper
  BLOCK_TIME_MS="$3" ./node_modules/.bin/hardhat node --port 8545 > "results/$2-node.log" 2>&1 &
  local node_pid=$!
  trap 'kill $node_pid 2>/dev/null || true' RETURN
  for _ in $(seq 1 30); do grep -q "Started HTTP and WebSocket" "results/$2-node.log" 2>/dev/null && break; sleep 1; done
  grep -q "Started HTTP and WebSocket" "results/$2-node.log" || { echo "Hardhat node did not start; is port 8545 in use?"; exit 1; }
  timeout 1800 npx caliper launch manager \
    --caliper-workspace . \
    --caliper-networkconfig networks/hardhat.json \
    --caliper-benchconfig "$1" \
    --caliper-flow-only-test false | tee "results/$2.log"
  mv report.html "results/$2.html"
  kill $node_pid 2>/dev/null || true
  wait $node_pid 2>/dev/null || true
}

run_caliper benchmarks/config.yaml caliper-latency 0          # automine: execution latency
run_caliper benchmarks/throughput.yaml caliper-throughput 1000  # 1 s blocks from a mempool
node scripts/summarize.js
