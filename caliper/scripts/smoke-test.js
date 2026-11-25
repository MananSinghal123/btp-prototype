/* Correctness check before benchmarking: deploys Mevres to an in-process Ganache chain and
   checks the contract against the prototype's JavaScript model (prototype/js/trade.js).
   Run: node scripts/smoke-test.js */
const path = require('path');
const ganache = require('ganache');
const Web3 = require('web3');
const contract = require('../contracts/Mevres.json');
const { commitmentOf, encrypt, quote, WAD, X0, Y0 } = require('../workloads/plan');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const toNum = (w) => Number(BigInt(w)) / 1e18;
const toWad = (v) => BigInt(Math.round(v * 1e6)) * 10n ** 12n;

(async () => {
    const { tradeMath } = await import(path.join(__dirname, '..', '..', 'prototype', 'js', 'trade.js'));
    const provider = ganache.provider({ logging: { quiet: true }, wallet: { deterministic: true } });
    const web3 = new Web3(provider);
    const [from] = await web3.eth.getAccounts();
    const c = await new web3.eth.Contract(contract.abi).deploy({ data: contract.bytecode }).send({ from, gas: contract.gas });
    const send = (m) => m.send({ from, gas: 1_000_000 });

    // ---- the report's single-trade example: sell 25 ETH, 1% slippage, 6 bidders, seed 7
    const P = { x0: 5000, pp: 3000, vext: 3000, fee: 0.003, dir: 'X2Y', amt: 25, tol: 0.01, nArb: 6, sig: 0.0015, off: 0, seed: 7 };
    const M = tradeMath(P);
    const amountIn = 25n * WAD;
    const q = quote({ x: X0, y: Y0 }, true, amountIn);
    check(Math.abs(toNum(q) - M.out0) < 1e-6, `pool quote ${toNum(q).toFixed(2)} USDC matches the model (${M.out0.toFixed(2)})`);
    const minOut = q * 9900n / 10000n;
    const salt = web3.utils.randomHex(32);

    await send(c.methods.commit(1, 1, commitmentOf(true, amountIn, minOut, salt), encrypt({ amountIn: amountIn.toString() })));
    for (const rep of M.reports) await send(c.methods.report(1, toWad(rep).toString()));
    const rc = await send(c.methods.settle(1, true, amountIn.toString(), minOut.toString(), salt));
    const ev = rc.events.Settled.returnValues;
    const pay = toNum(ev.payment), refund = toNum(ev.userRefund);
    check(Math.abs(pay - M.pay) < 0.01, `winner pays ${pay.toFixed(2)} USDC, model ${M.pay.toFixed(2)} (report: 1,217.84)`);
    check(Math.abs(refund - 0.9 * M.pay) < 0.01, `user refund ${refund.toFixed(2)} USDC (report: 1,096.05)`);
    check(ev.winner === from && rc.events.BundleChecked !== undefined, 'bundle legs recomputed on-chain and returned the user exactly the minimum');
    console.log(`      settle gas with 6 reports: ${rc.gasUsed}`);

    // ---- reverse direction: buy ETH with 60,000 USDC
    const a2 = 60000n * WAD, q2 = quote({ x: X0, y: Y0 }, false, a2), m2 = q2 * 9950n / 10000n, s2 = web3.utils.randomHex(32);
    await send(c.methods.commit(2, 2, commitmentOf(false, a2, m2, s2), '0x00'));
    for (const p of [2990, 3000, 3006, 3011]) await send(c.methods.report(2, toWad(p).toString()));
    const r2 = await send(c.methods.settle(2, false, a2.toString(), m2.toString(), s2));
    check(r2.events.Settled !== undefined, `USDC -> ETH trade settles (payment ${toNum(r2.events.Settled.returnValues.payment).toFixed(2)} USDC; lowest price report wins)`);

    // ---- a submission whose plaintext does not match its commitment
    await send(c.methods.commit(3, 3, commitmentOf(true, amountIn, minOut + 1n, salt), '0x00'));
    await send(c.methods.report(3, toWad(3000).toString()));
    const r3 = await send(c.methods.settle(3, true, amountIn.toString(), minOut.toString(), salt));
    check(r3.events.Rejected !== undefined, 'mismatched commitment is rejected');

    // ---- reports after the epoch closed are refused
    let refused = false;
    try { await send(c.methods.report(1, toWad(3000).toString())); } catch { refused = true; }
    check(refused, 'report after settlement started is refused');

    // ---- rebalance moves the pool to the winning price and pays LPs
    await send(c.methods.commit(4, 4, commitmentOf(true, 1n, 1n, salt), '0x00'));
    for (const p of [3010, 3020, 3015]) await send(c.methods.report(4, toWad(p).toString()));
    const r4 = await send(c.methods.rebalance(4));
    const rb = r4.events.Rebalanced.returnValues;
    const newPrice = toNum(rb.newY) / toNum(rb.newX);
    check(Math.abs(newPrice - 3020) < 0.01, `rebalance moves the pool to the top report (${newPrice.toFixed(2)})`);

    // ---- unprotected baseline
    const r5 = await send(c.methods.swap(true, amountIn.toString(), minOut.toString()));
    check(Math.abs(toNum(r5.events.Swapped.returnValues.amountOut) - M.out0) < 1e-6, 'baseline swap returns the pool quote');

    console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
