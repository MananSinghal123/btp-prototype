/* Compiles contracts/Mevres.sol into the JSON format the Caliper Ethereum connector deploys:
   { name, abi, bytecode, gas }. Run: node scripts/compile.js */
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const src = path.join(__dirname, '..', 'contracts', 'Mevres.sol');
const input = {
    language: 'Solidity',
    sources: { 'Mevres.sol': { content: fs.readFileSync(src, 'utf8') } },
    settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'shanghai',   // what Ganache 7.9 runs by default
        outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter(e => e.severity === 'error');
(out.errors || []).forEach(e => console.error(e.formattedMessage));
if (errors.length) process.exit(1);

const c = out.contracts['Mevres.sol'].Mevres;
const json = { name: 'Mevres', abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, gas: 6000000 };
fs.writeFileSync(path.join(__dirname, '..', 'contracts', 'Mevres.json'), JSON.stringify(json, null, 2));
console.log(`compiled Mevres: ${c.evm.bytecode.object.length / 2} bytes, ${c.abi.length} ABI entries`);
