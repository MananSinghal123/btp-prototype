/* Collects the Caliper summaries and gas measurements into results/RESULTS.md.
   Run after run.sh (or the individual steps): node scripts/summarize.js [--gwei 10] [--eth 3000]
   The gas price and ETH price only convert gas to dollars; change them to match the network. */
const fs = require('fs');
const path = require('path');

const R = path.join(__dirname, '..', 'results');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? +process.argv[i + 1] : d; };
const gwei = arg('gwei', 10), ethUsd = arg('eth', 3000);
const usd = (gas) => '$' + (gas * gwei * 1e-9 * ethUsd).toFixed(2);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const read = (f) => (fs.existsSync(path.join(R, f)) ? fs.readFileSync(path.join(R, f), 'utf8') : null);

/* the final "All test results" table of a Caliper log */
function caliperTable(file) {
    const log = read(file);
    if (!log) return null;
    const clean = log.replace(/\x1b\[[0-9;]*m/g, '');
    const tail = clean.slice(clean.lastIndexOf('All test results'));
    return tail.split('\n').filter(l => /^\| [a-z]/.test(l) && !l.startsWith('| Name')).map(l => {
        const c = l.split('|').map(s => s.trim()).filter(Boolean);
        return { name: c[0], succ: +c[1], fail: +c[2], send: +c[3], maxLat: +c[4], minLat: +c[5], avgLat: +c[6], tput: +c[7] };
    });
}

const out = [];
const say = (s = '') => out.push(s);
say('# MEVRES on Hyperledger Caliper: results\n');
say('Local Hardhat node, Caliper 0.6.0, one worker. The latency run uses automining (one block per transaction);');
say('the throughput run mines a block every second from a mempool.');
say('Latency and throughput describe this local node only, not Ethereum mainnet, where a block takes about 12 seconds.');
say(`Dollar figures assume ${gwei} gwei and $${ethUsd} per ETH.\n`);

for (const [file, title] of [['caliper-latency.log', 'fixed 50 TPS send rate, automining'], ['caliper-throughput.log', 'maximum sustained throughput, 1-second blocks']]) {
    const t = caliperTable(file);
    if (!t) continue;
    say(`## Caliper: ${title}\n`);
    say('| Round | Succeeded | Failed | Send rate (TPS) | Throughput (TPS) | Avg latency (s) | Max latency (s) |');
    say('|---|---|---|---|---|---|---|');
    t.forEach(r => say(`| ${r.name} | ${r.succ} | ${r.fail} | ${r.send} | ${r.tput} | ${r.avgLat} | ${r.maxLat} |`));
    say();
}

const ops = ['swap-unprotected', 'commit', 'report', 'settle', 'rebalance'];
const gas = Object.fromEntries(ops.map(o => [o, read(`gas-${o}.json`) && JSON.parse(read(`gas-${o}.json`))]).filter(([, v]) => v));
if (Object.keys(gas).length) {
    say('## Gas per transaction (latency run: 300 trades, 2 per epoch, 6 bidders)\n');
    say('| Transaction | Count | Mean gas | Min | Max | Cost | Outcomes |');
    say('|---|---|---|---|---|---|---|');
    for (const [k, g] of Object.entries(gas)) {
        const ev = Object.entries(g.events).map(([e, n]) => `${e} ${n}`).join(', ');
        say(`| ${k} | ${g.transactions} | ${fmt(g.gas.mean)} | ${fmt(g.gas.min)} | ${fmt(g.gas.max)} | ${usd(g.gas.mean)} | ${ev} |`);
    }
    if (gas.commit && gas.report && gas.settle && gas.rebalance && gas['swap-unprotected']) {
        const per = gas.commit.gas.mean + gas.settle.gas.mean + (gas.report.gas.mean * 6 + gas.rebalance.gas.mean) / 2;
        const sw = gas['swap-unprotected'].gas.mean;
        say(`\nPer trade under MEVRES: commit + settle + (6 reports + rebalance) / 2 trades = **${fmt(per)} gas (${usd(per)})**, `
          + `against **${fmt(sw)} gas (${usd(sw)})** for an unprotected swap: **${(per / sw).toFixed(1)}×**.`);
        say(`\nCapacity of a 30,000,000-gas block (the limit configured here): about **${fmt(30e6 / per)} MEVRES trades** `
          + `against **${fmt(30e6 / sw)} unprotected swaps**. On a real chain gas, not node CPU, sets this limit.`);
    }
    say();
}

const scaling = read('gas-scaling.json') && JSON.parse(read('gas-scaling.json'));
if (scaling) {
    say('## Gas per trade by number of bidders and trades per epoch\n');
    say(`Unprotected swap: ${fmt(scaling.swap)} gas (${usd(scaling.swap)}).\n`);
    say('| Bidders | Trades per epoch | Gas per trade | Cost | × swap |');
    say('|---|---|---|---|---|');
    scaling.rows.forEach(r => say(`| ${r.bidders} | ${r.perEpoch} | ${fmt(r.perTrade)} | ${usd(r.perTrade)} | ${r.vsSwap}× |`));
    say();
}

fs.writeFileSync(path.join(R, 'RESULTS.md'), out.join('\n'));
console.log(out.join('\n'));
