/* An in-process Hardhat chain for the smoke test and gas scaling, with the settings in
   hardhat.config.js (Shanghai, zero base fee, automining). Hardhat replaces Ganache here:
   Ganache 7 is unmaintained and fails on Node 24.
   web3 1.2.6 expects a callback-style provider, so Hardhat's EIP-1193 provider is adapted. */
const path = require('path');
const Web3 = require('web3');

function inProcessWeb3() {
    process.chdir(path.join(__dirname, '..'));          // Hardhat reads hardhat.config.js from here
    const { network } = require('hardhat');
    const p = network.provider;
    let reset = p.request({ method: 'hardhat_reset', params: [] });
    const provider = {
        send(payload, cb) {
            reset.then(() => p.request({ method: payload.method, params: payload.params || [] })).then(
                (result) => cb(null, { jsonrpc: '2.0', id: payload.id, result }),
                (e) => {
                    // A revert comes back as a JSON-RPC error. web3 1.2.6 rejects the caller's promise
                    // with it and then rethrows it from this callback; the caller already has the
                    // error, so the rethrow is contained here instead of becoming an unhandled rejection.
                    try { cb(null, { jsonrpc: '2.0', id: payload.id, error: { code: e.code || -32000, message: e.message, data: e.data } }); } catch { /* already delivered */ }
                },
            );
        },
    };
    return new Web3(provider);
}

module.exports = { inProcessWeb3 };
