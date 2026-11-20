# MEVRES Auction Simulator

Prototype of MEVRES: MEV redistribution through an encrypted, second-price auction
on a constant-product pool. Plain HTML, CSS and JavaScript modules. No build step,
no dependencies.

## Run

The page uses JavaScript modules, which browsers only load over HTTP, so start a
local server from this folder (needs Python 3):

    python -m http.server 8000        # Windows
    python3 -m http.server 8000       # macOS / Linux

Then open http://localhost:8000 and press Ctrl+C in the terminal to stop.

No Python? Double-click `standalone.html`. It is the same application in one file.

## Structure

    index.html          page structure
    css/styles.css      styling, light and dark themes
    js/app.js           page controller: reads inputs, renders results, wires events
    js/trade.js         one trade end to end: bids, winner, bundle states, costs
    js/simulation.js    market simulation: unprotected pool vs MEVRES pool
    js/pool.js          constant-product pool maths and the front-run state
    js/auction.js       bundle valuation and the second-price rule
    js/crypto.js        SHA-256 commitment, AES-256-GCM encryption, sealing a trade
    js/shamir.js        Shamir secret sharing over GF(2^8)
    js/random.js        seeded random numbers (reproducible runs)
    js/charts.js        SVG line chart with hover
    js/util.js          formatting helpers
    bench/benchmark.mjs headless benchmark: MEVRES vs unprotected DEX vs encrypted only
    bench/results.md    output of the benchmark (1,000 runs per setting)
    standalone.html     single-file build of the same application

`trade.js`, `simulation.js`, `pool.js`, `auction.js`, `shamir.js` and `random.js`
are pure functions with no access to the page, so they can be reused or tested alone.

## Protocol steps and where they live

1. Commit and encrypt        `crypto.js` (seal), `shamir.js` (split)
2. Blind bidding             `trade.js` (reports from seeded beliefs)
3. Decrypt, verify, winner   `shamir.js` (combine), `crypto.js` (open), `auction.js`
4. Sandwich bundle           `pool.js` (frontState, apply)
5. Redistribution            `app.js` (alpha split of the payment)

## Benchmark

The browser page compares MEVRES against an unprotected DEX. The headless benchmark adds
two things that comparison lacks (needs Node 22 or later, no dependencies):

- **A sandwich-rate sweep.** The report's baseline sandwiches every profitable trade, which is
  a worst case. `--rates` sets the share of profitable trades a searcher actually attacks.
- **An encrypted-only ablation.** Trades are hidden, so nobody sandwiches them, but nothing is
  auctioned or refunded. Comparing it with MEVRES shows what the auction adds on top of the
  encryption layer.

Run from this folder:

    node bench/benchmark.mjs                       # 1,000 runs, Table 4.1 parameters
    node bench/benchmark.mjs --runs 200 --rates 1,0.1
    node bench/benchmark.mjs --md bench/results.md # write the tables to a file

Seeds 1 to N are used, as in the report. With a 100% sandwich rate the MEVRES and unprotected
numbers match Table 4.3 of the report exactly. The page has the same two additions: a
"Profitable trades sandwiched %" input and an "Encrypted only" line on both charts.

The benchmark still compares against models, not against another paper's system or real
on-chain data. In particular, MEVRES's advantage over the encrypted-only pool rests on the
model's assumption that the winning arbitrageur unwinds the trade at the external price with
no cost or price impact.
