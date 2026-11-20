# MEVRES benchmark

1000 runs per setting (seeds 1–1000), parameters of Table 4.1. Mean, with 5th–95th percentile range.

## User cost (bps of fair value, lower is better)

| Sandwich rate | Trades sandwiched | Unprotected DEX | Encrypted only | MEVRES | MEVRES vs unprotected |
|---|---|---|---|---|---|
| 100% | 96.1% | 164.2 (155.5 – 177.4) | 70.1 (62.0 – 83.0) | 35.9 (34.5 – 37.5) | −78.1% |
| 50% | 48.0% | 117.3 (107.5 – 131.0) | 70.1 (62.0 – 83.0) | 35.9 (34.5 – 37.5) | −69.4% |
| 20% | 19.2% | 88.9 (79.5 – 102.1) | 70.1 (62.0 – 83.0) | 35.9 (34.5 – 37.5) | −59.6% |
| 5% | 4.8% | 74.8 (66.2 – 87.8) | 70.1 (62.0 – 83.0) | 35.9 (34.5 – 37.5) | −52.0% |

## LP profit per run (USDC, higher is better)

| Unprotected DEX | Encrypted only | MEVRES |
|---|---|---|
| -19,560 (-42,800 – -4,812) | -19,560 (-42,800 – -4,812) | 92,130 (85,114 – 100,372) |

The same at every sandwich rate: a sandwich moves value from the user to the searcher, not from the pool.

## Paired comparison (same seed)

| Comparison | Runs where MEVRES is better |
|---|---|
| User cost vs unprotected, 100% sandwich rate | 1000 of 1000 |
| User cost vs unprotected, 50% sandwich rate | 1000 of 1000 |
| User cost vs unprotected, 20% sandwich rate | 1000 of 1000 |
| User cost vs unprotected, 5% sandwich rate | 1000 of 1000 |
| User cost vs encrypted only | 1000 of 1000 |
| LP profit vs encrypted only | 1000 of 1000 |
