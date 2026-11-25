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
  # Caliper 0.6 sometimes keeps running after "Benchmark successfully finished!" (open
  # WebSocket handles), so watch the log and stop it once the benchmark has ended.
  ./node_modules/.bin/caliper launch manager \
    --caliper-workspace . \
    --caliper-networkconfig networks/hardhat.json \
    --caliper-benchconfig "$1" \
    --caliper-flow-only-test false > "results/$2.log" 2>&1 &
  local cal_pid=$!
  tail -n +1 -f "results/$2.log" --pid=$cal_pid &
  local tail_pid=$!
  local waited=0
  while kill -0 $cal_pid 2>/dev/null && [ $waited -lt 1800 ]; do
    if grep -aq -e "Benchmark successfully finished" -e "Benchmark failed" "results/$2.log"; then
      sleep 3
      pkill -P $cal_pid 2>/dev/null || true
      kill $cal_pid 2>/dev/null || true
      break
    fi
    sleep 2; waited=$((waited + 2))
  done
  kill $cal_pid 2>/dev/null || true
  wait $cal_pid 2>/dev/null || true
  kill $tail_pid 2>/dev/null || true
  grep -aq "Benchmark successfully finished" "results/$2.log" \
    || { echo "Caliper benchmark $1 did not finish; see results/$2.log"; exit 1; }
  mv report.html "results/$2.html"
  kill $node_pid 2>/dev/null || true
  wait $node_pid 2>/dev/null || true
}

run_caliper benchmarks/config.yaml caliper-latency 0          # automine: execution latency
run_caliper benchmarks/throughput.yaml caliper-throughput 1000  # 1 s blocks from a mempool
node scripts/summarize.js
