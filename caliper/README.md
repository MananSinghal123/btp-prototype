# MEVRES on Hyperledger Caliper

A Solidity implementation of the on-chain part of MEVRES, benchmarked with
[Hyperledger Caliper](https://hyperledger-caliper.github.io/caliper/) on a local
Ethereum node, against an ordinary unprotected swap.

Results: [`results/RESULTS.md`](results/RESULTS.md).

## Key findings

- **It works on-chain.** All 11,700 benchmark transactions (1,950 at 50 TPS, 9,750 at maximum rate) succeeded across both Caliper runs,
  and the contract reproduces the report's single-trade example exactly.
- **MEVRES costs about 10.7× the gas of a plain swap** with the report's settings (6 bidders,
  2 trades per epoch): about 545,500 gas per trade against 51,100. At 10 gwei and $3,000 per ETH
  that is about $16.37 against $1.53.
- **Most of that is shared per-epoch cost, so batching matters.** Price reports and the
  rebalance auction are paid once per epoch. With 50 trades per epoch the overhead falls to
  4×, with 2 bidders to 3.7×; with 32 bidders and one trade per epoch it rises to 70×.
- **Gas sets capacity.** A 30M-gas block fits about 55 MEVRES trades against about 588 plain
  swaps at the report's settings.
- **Gas is small next to the simulated saving for a typical trade.** The simulation's median
  trade is $20,000, and MEVRES saves 128 bps against the worst-case attacker (about $256) or
  34 bps against encryption alone (about $68), against about $15 of extra gas. For small
  trades the gas can exceed the saving. This is a rough comparison of two separate models.
- **Caliper's throughput numbers are limited by the local node, not the contract.** Every
  transaction type, including the plain swap, sustained roughly 80–130 TPS on one machine (the figures vary from run to run), so they do
  not separate MEVRES from the baseline. Gas does.

## What is measured

| Transaction | Protocol step | What it does on-chain |
|---|---|---|
| `swap` | baseline | Constant-product swap with no MEV protection |
| `commit` | 1 | Stores the hash commitment, emits the AES-256-GCM ciphertext |
| `report` | 2 | Stores one arbitrageur's price report for an epoch |
| `settle` | 3–5 | Checks the decrypted trade against its commitment, runs the second-price auction over the epoch's reports, recomputes the sandwich legs and checks the user gets exactly the minimum, splits the payment (90% user, 10% LPs) |
| `rebalance` | end of epoch | Auctions the move of the pool to the external price; payment to LPs |

An epoch stands for one block of trades: its trades share one set of price reports.

- **Caliper** reports success rate, latency and throughput for each transaction type, at a
  fixed 50 TPS (`benchmarks/config.yaml`) and at the highest rate the node sustains
  (`benchmarks/throughput.yaml`).
- **Gas** is recorded from every receipt by the workload, and `scripts/gas-scaling.js`
  measures gas per trade across 2–32 bidders and 1–50 trades per epoch.
- **Correctness** is checked first by `scripts/smoke-test.js`. It reproduces the report's
  single-trade example on-chain (25 ETH sale: winner pays 1,217.84 USDC, user refund 1,096.05).

## Run it

Needs Node 18 or later (tested on Node 22; Node 24 works for the smoke test and gas scaling). From this folder:

    npm install
    npx caliper bind --caliper-bind-sut ethereum:1.3
    ./run.sh

`run.sh` compiles the contract, runs the smoke test and gas scaling, starts a Hardhat node,
runs both Caliper configs, stops the node, and writes `results/RESULTS.md`. Individual steps:

    npm run compile                 # contracts/Mevres.sol -> contracts/Mevres.json
    npm test                        # smoke test against the prototype's JavaScript model
    node scripts/gas-scaling.js     # gas per trade by bidders and epoch size
    npx hardhat node --port 8545    # then, in another terminal:
    npx caliper launch manager --caliper-workspace . \
      --caliper-networkconfig networks/hardhat.json \
      --caliper-benchconfig benchmarks/config.yaml --caliper-flow-only-test false
    node scripts/summarize.js --gwei 10 --eth 3000

## Files

    contracts/Mevres.sol       the contract
    contracts/Mevres.json      compiled ABI and bytecode, the format Caliper deploys
    networks/hardhat.json      Caliper network config (local node, Hardhat's public test keys)
    benchmarks/config.yaml     five rounds at a fixed 50 TPS
    benchmarks/throughput.yaml the same rounds, five times larger, maximum-rate controller
    workloads/plan.js          deterministic trades, commitments and reports (seeded)
    workloads/mevres.js        Caliper workload module, one per round via the `op` argument
    scripts/                   compile, smoke test, gas scaling, summary
    run.sh                     everything above in order

## Versions and why

- **Caliper 0.6.0.** Caliper 0.7 removed the Ethereum connector and supports only Fabric.
- **Hardhat 2 as the node.** Caliper's Ethereum connector needs a WebSocket endpoint, which
  Hardhat's node provides. The smoke test and gas scaling use Hardhat in-process
  (`scripts/chain.js`). Ganache is not used: it is unmaintained and fails on Node 24.
- **One worker.** The plan is one ordered stream from one account, so rounds must run in
  order (swap, commit, report, settle, rebalance) with a single worker.

## Limits of these numbers

- **The node is local and automines** one block per transaction. Latency and throughput say
  how fast this contract executes on one machine, not how MEVRES would perform on Ethereum,
  where blocks take about 12 seconds and gas, not CPU, limits a block.
- **Gas is the portable result.** It is the same on any EVM chain, so it is what to compare
  with the unprotected swap.
- **The contract is a lower bound on cost.** Threshold decryption runs off-chain and
  `settle()` does not verify the nodes' decryption shares, assets are ledger balances rather
  than ERC-20 tokens, and price reports are posted in the clear rather than sealed. Each of
  these would add gas in a deployment.
- **The external price is held fixed** in the Caliper plan (`vol: 0`). Caliper runs every
  settle before any rebalance, so a moving price would leave later epochs facing a stale pool.
