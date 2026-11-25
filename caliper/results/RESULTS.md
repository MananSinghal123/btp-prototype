# MEVRES on Hyperledger Caliper: results

Local Hardhat node, Caliper 0.6.0, one worker. The latency run uses automining (one block per transaction);
the throughput run mines a block every second from a mempool.
Latency and throughput describe this local node only, not Ethereum mainnet, where a block takes about 12 seconds.
Dollar figures assume 10 gwei and $3000 per ETH.

## Caliper: fixed 50 TPS send rate, automining

| Round | Succeeded | Failed | Send rate (TPS) | Throughput (TPS) | Avg latency (s) | Max latency (s) |
|---|---|---|---|---|---|---|
| swap-unprotected | 300 | 0 | 50.2 | 50.1 | 0.01 | 0.02 |
| commit | 300 | 0 | 50.2 | 50.2 | 0 | 0.01 |
| report | 900 | 0 | 50.1 | 50 | 0 | 0.02 |
| settle | 300 | 0 | 50.2 | 50.1 | 0.01 | 0.03 |
| rebalance | 150 | 0 | 50.4 | 50.1 | 0.01 | 0.08 |

## Caliper: maximum sustained throughput, 1-second blocks

| Round | Succeeded | Failed | Send rate (TPS) | Throughput (TPS) | Avg latency (s) | Max latency (s) |
|---|---|---|---|---|---|---|
| max-swap-unprotected | 1500 | 0 | 87.3 | 82.8 | 0.56 | 1.13 |
| max-commit | 1500 | 0 | 89.7 | 89.2 | 0.55 | 1.11 |
| max-report | 4500 | 0 | 130.5 | 129.2 | 0.59 | 1.14 |
| max-settle | 1500 | 0 | 97 | 94.3 | 0.76 | 1.43 |
| max-rebalance | 750 | 0 | 113.9 | 90.1 | 1.86 | 3.81 |

## Gas per transaction (latency run: 300 trades, 2 per epoch, 6 bidders)

| Transaction | Count | Mean gas | Min | Max | Cost | Outcomes |
|---|---|---|---|---|---|---|
| swap-unprotected | 300 | 51,055 | 50,804 | 102,141 | $1.53 | Swapped 300 |
| commit | 300 | 79,557 | 79,497 | 79,605 | $2.39 | Committed 300 |
| report | 900 | 78,516 | 75,655 | 92,767 | $2.36 | Reported 900 |
| settle | 300 | 119,721 | 109,416 | 163,869 | $3.59 | BundleChecked 300, Settled 300 |
| rebalance | 150 | 221,354 | 221,338 | 221,370 | $6.64 | Rebalanced 150 |

Per trade under MEVRES: commit + settle + (6 reports + rebalance) / 2 trades = **545,503 gas ($16.37)**, against **51,055 gas ($1.53)** for an unprotected swap: **10.7×**.

Capacity of a 30,000,000-gas block (the limit configured here): about **55 MEVRES trades** against **588 unprotected swaps**. On a real chain gas, not node CPU, sets this limit.

## Gas per trade by number of bidders and trades per epoch

Unprotected swap: 50,829 gas ($1.52).

| Bidders | Trades per epoch | Gas per trade | Cost | × swap |
|---|---|---|---|---|
| 2 | 1 | 588,456 | $17.65 | 11.6× |
| 2 | 2 | 382,693 | $11.48 | 7.5× |
| 2 | 10 | 219,813 | $6.59 | 4.3× |
| 2 | 50 | 185,537 | $5.57 | 3.7× |
| 6 | 1 | 986,447 | $29.59 | 19.4× |
| 6 | 2 | 595,976 | $17.88 | 11.7× |
| 6 | 10 | 269,858 | $8.10 | 5.3× |
| 6 | 50 | 204,642 | $6.14 | 4× |
| 12 | 1 | 1,583,559 | $47.51 | 31.2× |
| 12 | 2 | 894,509 | $26.84 | 17.6× |
| 12 | 10 | 344,923 | $10.35 | 6.8× |
| 12 | 50 | 233,322 | $7.00 | 4.6× |
| 24 | 1 | 2,777,227 | $83.32 | 54.6× |
| 24 | 2 | 1,508,297 | $45.25 | 29.7× |
| 24 | 10 | 495,053 | $14.85 | 9.7× |
| 24 | 50 | 290,632 | $8.72 | 5.7× |
| 32 | 1 | 3,573,095 | $107.19 | 70.3× |
| 32 | 2 | 1,926,297 | $57.79 | 37.9× |
| 32 | 10 | 595,150 | $17.85 | 11.7× |
| 32 | 50 | 328,843 | $9.87 | 6.5× |
