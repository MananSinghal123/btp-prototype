/* Hardhat is used only as the local Ethereum node Caliper benchmarks against.
   Default: automining, every transaction is mined into its own block as soon as it arrives.
   BLOCK_TIME_MS=1000: interval mining, a block every second from a mempool. Automining rejects
   transactions that arrive with a nonce ahead of the next expected one, which happens at high
   send rates, so the throughput benchmark uses interval mining. */
const interval = Number(process.env.BLOCK_TIME_MS || 0);

module.exports = {
    networks: {
        hardhat: {
            chainId: 31337,
            hardfork: 'shanghai',
            mining: interval > 0 ? { auto: false, interval } : { auto: true },
            blockGasLimit: 30_000_000,
            initialBaseFeePerGas: 0,
        },
    },
};
