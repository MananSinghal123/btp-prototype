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
    standalone.html     single-file build of the same application

`trade.js`, `simulation.js`, `pool.js`, `auction.js`, `shamir.js` and `random.js`
are pure functions with no access to the page, so they can be reused or tested alone.

## Protocol steps and where they live

1. Commit and encrypt        `crypto.js` (seal), `shamir.js` (split)
2. Blind bidding             `trade.js` (reports from seeded beliefs)
3. Decrypt, verify, winner   `shamir.js` (combine), `crypto.js` (open), `auction.js`
4. Sandwich bundle           `pool.js` (frontState, apply)
5. Redistribution            `app.js` (alpha split of the payment)
