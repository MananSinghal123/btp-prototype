/* Gas per trade as a function of bidders and trades per epoch. Gas is deterministic, so this
   runs on an in-process Hardhat chain instead of through Caliper. For each setting it deploys a fresh
   contract, runs one epoch end to end and attributes shared costs to trades:
     per trade = commit + settle + (bidders x report + rebalance) / trades per epoch
   Run: node scripts/gas-scaling.js   (writes results/gas-scaling.json) */
const fs = require('fs');
const path = require('path');
const { inProcessWeb3 } = require('./chain');
const contract = require('../contracts/Mevres.json');
const { buildPlan, encrypt } = require('../workloads/plan');

const BIDDERS = [2, 6, 12, 24, 32];
const PER_EPOCH = [1, 2, 10, 50];

(async () => {
    const web3 = inProcessWeb3();
    const [from] = await web3.eth.getAccounts();
    const send = async (m) => (await m.send({ from, gas: 2_000_000 }).on('error', () => {})).gasUsed;
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

    const rows = [];
    let swapGas;
    for (const bidders of BIDDERS) {
        for (const perEpoch of PER_EPOCH) {
            const c = await new web3.eth.Contract(contract.abi).deploy({ data: contract.bytecode }).send({ from, gas: contract.gas });
            const plan = buildPlan({ trades: perEpoch, tradesPerEpoch: perEpoch, bidders, seed: 7, vol: 0 });
            const e = plan.epochs[0];
            const commit = [], report = [], settle = [];
            for (const t of plan.trades) commit.push(await send(c.methods.commit(t.id, t.epoch, t.commitment, encrypt({ a: t.amountIn.toString(), m: t.minOut.toString(), s: t.salt }))));
            for (const p of e.reports) report.push(await send(c.methods.report(e.epoch, p.toString())));
            for (const t of plan.trades) settle.push(await send(c.methods.settle(t.id, t.xToY, t.amountIn.toString(), t.minOut.toString(), t.salt)));
            const rebalance = await send(c.methods.rebalance(e.epoch));
            if (swapGas === undefined) {
                const s = plan.swaps[0];
                swapGas = await send(c.methods.swap(s.xToY, s.amountIn.toString(), s.minOut.toString()));
            }
            const perTrade = mean(commit) + mean(settle) + (report.reduce((s, v) => s + v, 0) + rebalance) / perEpoch;
            rows.push({ bidders, perEpoch, commit: Math.round(mean(commit)), report: Math.round(mean(report)), settle: Math.round(mean(settle)), rebalance, perTrade: Math.round(perTrade), vsSwap: +(perTrade / swapGas).toFixed(1) });
        }
    }

    const out = { swap: swapGas, rows, note: 'Gas units. Each row is one epoch run on a fresh contract. Swap is the unprotected baseline.' };
    fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '..', 'results', 'gas-scaling.json'), JSON.stringify(out, null, 2));

    console.log(`Unprotected swap: ${swapGas} gas\n`);
    console.log('| Bidders | Trades per epoch | Settle | Rebalance | Gas per trade | × swap |');
    console.log('|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.bidders} | ${r.perEpoch} | ${r.settle.toLocaleString('en-US')} | ${r.rebalance.toLocaleString('en-US')} | ${r.perTrade.toLocaleString('en-US')} | ${r.vsSwap}× |`);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
