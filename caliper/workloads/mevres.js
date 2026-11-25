'use strict';
/* Caliper workload for the Mevres contract. One module serves every round; the round's
   `op` argument picks the transaction type:
     swap       unprotected baseline swap
     commit     step 1: hash commitment plus AES-256-GCM ciphertext
     report     step 2: one price report per bidder per epoch
     settle     steps 3-5: verify, auction, bundle check, refund
     rebalance  end-of-epoch auction of the move to the external price
   Every round rebuilds the same plan from the same seed (see plan.js). Rounds must run in the
   order above, with one worker: the plan is a single ordered stream from one account.
   Gas used and the outcome of each transaction are written to results/gas-<label>.json. */
const fs = require('fs');
const path = require('path');
const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { buildPlan, encrypt } = require('./plan');

class MevresWorkload extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        if (totalWorkers !== 1) throw new Error('The MEVRES workload needs exactly one worker (one ordered stream from one account).');
        const a = roundArguments;
        this.label = a.label || a.op;
        const plan = buildPlan(a);
        this.requests = this.toRequests(a.op, plan);
        this.next = 0;
        this.gas = [];
        this.outcomes = {};
    }

    toRequests(op, plan) {
        const req = (verb, args) => ({ contract: 'mevres', verb, args, readOnly: false });
        switch (op) {
        case 'swap':
            return plan.swaps.map(s => req('swap', [s.xToY, s.amountIn.toString(), s.minOut.toString()]));
        case 'commit':
            return plan.trades.map(t => req('commit', [t.id, t.epoch, t.commitment,
                encrypt({ xToY: t.xToY, amountIn: t.amountIn.toString(), minOut: t.minOut.toString(), salt: t.salt })]));
        case 'report':
            return plan.epochs.flatMap(e => e.reports.map(p => req('report', [e.epoch, p.toString()])));
        case 'settle':
            return plan.trades.map(t => req('settle', [t.id, t.xToY, t.amountIn.toString(), t.minOut.toString(), t.salt]));
        case 'rebalance':
            return plan.epochs.map(e => req('rebalance', [e.epoch]));
        default:
            throw new Error(`unknown op ${op}`);
        }
    }

    async submitTransaction() {
        if (this.next >= this.requests.length) {
            throw new Error(`round ${this.label} asked for more transactions than the plan has (${this.requests.length}); fix txNumber`);
        }
        const status = await this.sutAdapter.sendRequests(this.requests[this.next++]);
        const rc = status.GetResult();
        if (rc && rc.gasUsed) {
            this.gas.push(rc.gasUsed);
            for (const name of Object.keys(rc.events || {})) this.outcomes[name] = (this.outcomes[name] || 0) + 1;
        } else {
            this.outcomes.failed = (this.outcomes.failed || 0) + 1;
        }
    }

    async cleanupWorkloadModule() {
        const g = [...this.gas].sort((x, y) => x - y);
        const mean = g.length ? g.reduce((s, v) => s + v, 0) / g.length : 0;
        const out = { label: this.label, transactions: g.length, gas: { mean: Math.round(mean), min: g[0], median: g[Math.floor(g.length / 2)], max: g[g.length - 1] }, events: this.outcomes };
        const dir = path.resolve(process.cwd(), 'results');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `gas-${this.label}.json`), JSON.stringify(out, null, 2));
    }
}

module.exports.createWorkloadModule = () => new MevresWorkload();
