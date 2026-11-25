'use strict';
/* Deterministic benchmark plan: the trades, commitments and price reports every round uses.
   Each Caliper round rebuilds the same plan from the same seed, so the commit, report, settle
   and rebalance rounds agree on ids, salts and amounts without sharing memory.
   Trade distribution follows the prototype's market simulation (Table 4.1 of the report). */
const crypto = require('crypto');
const Web3 = require('web3');

const web3 = new Web3();
const WAD = 10n ** 18n;
const FEE_BPS = 30n;
const X0 = 5000n * WAD;
const Y0 = 15000000n * WAD;

/* same generator as prototype/js/random.js */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
const toWad = (v) => BigInt(Math.round(v * 1e6)) * 10n ** 12n;

/* constant-product output with the fee taken from the input, exactly as the contract computes it */
function quote(pool, xToY, amountIn) {
    const din = amountIn - amountIn * FEE_BPS / 10000n;
    return xToY ? pool.y - pool.x * pool.y / (pool.x + din) : pool.x - pool.x * pool.y / (pool.y + din);
}

function commitmentOf(xToY, amountIn, minOut, salt) {
    return web3.utils.keccak256(web3.eth.abi.encodeParameters(
        ['bool', 'uint256', 'uint256', 'bytes32'], [xToY, amountIn.toString(), minOut.toString(), salt]));
}

/* AES-256-GCM over the plaintext trade: what step 1 publishes on-chain */
function encrypt(trade) {
    const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([c.update(JSON.stringify(trade)), c.final()]);
    return '0x' + Buffer.concat([iv, body, c.getAuthTag()]).toString('hex');
}

/**
 * @param {object} o trades, tradesPerEpoch, bidders, seed, price, vol, sig, median, tamperRate
 */
function buildPlan(o) {
    const { trades: n, tradesPerEpoch, bidders, seed } = o;
    const price = o.price ?? 3000, vol = o.vol ?? 0.0012, sig = o.sig ?? 0.0015, median = o.median ?? 20000;
    const tamperRate = o.tamperRate ?? 0;
    const r = rng(seed);
    const mevPool = { x: X0, y: Y0 };          // MEVRES quotes from the epoch's start state
    const swapPool = { x: X0, y: Y0 };         // baseline pool moves with every swap
    const out = { trades: [], swaps: [], epochs: [] };
    let v = price;

    const nEpochs = Math.ceil(n / tradesPerEpoch);
    for (let e = 0; e < nEpochs; e++) {
        v *= Math.exp(vol * gauss(r));
        const epoch = e + 1;
        const reports = Array.from({ length: bidders }, () => toWad(v * (1 + sig * gauss(r))));
        out.epochs.push({ epoch, reports, external: v });
        for (let j = 0; j < tradesPerEpoch && out.trades.length < n; j++) {
            const i = out.trades.length;
            const xToY = r() < 0.5;
            const notional = median * Math.exp(0.9 * gauss(r));
            const amountIn = xToY ? toWad(notional / v) : toWad(notional);
            const tolBps = BigInt(Math.round((0.003 + 0.012 * r()) * 10000));
            const minOut = quote(mevPool, xToY, amountIn) * (10000n - tolBps) / 10000n;
            const salt = web3.utils.soliditySha3({ t: 'uint256', v: seed }, { t: 'uint256', v: i });
            const tampered = r() < tamperRate;
            // a tampered submission commits to a different minimum than it later reveals
            const commitment = commitmentOf(xToY, amountIn, tampered ? minOut + 1n : minOut, salt);
            out.trades.push({ id: i + 1, epoch, xToY, amountIn, minOut, salt, commitment, tampered });

            const sOut = quote(swapPool, xToY, amountIn);
            const din = amountIn - amountIn * FEE_BPS / 10000n;
            if (xToY) { swapPool.x += din; swapPool.y -= sOut; } else { swapPool.y += din; swapPool.x -= sOut; }
            out.swaps.push({ xToY, amountIn, minOut: sOut * (10000n - tolBps) / 10000n });
        }
    }
    return out;
}

module.exports = { buildPlan, commitmentOf, encrypt, quote, WAD, X0, Y0 };
