// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MEVRES on-chain settlement (benchmark version)
/// @notice Runs the on-chain parts of the MEVRES protocol so they can be measured with
/// Hyperledger Caliper:
///   commit()    Step 1  user posts a hash commitment and the encrypted trade
///   report()    Step 2  arbitrageurs post price reports for an epoch (one block of trades)
///   settle()    Steps 3-5  check the decrypted trade against its commitment, run the
///               second-price auction, check the sandwich bundle, split the payment
///   rebalance() end of epoch: auction the move to the external price, payment to LPs
///   swap()      baseline: an ordinary constant-product swap with no protection
///
/// Simplifications, all of which make the measured cost a lower bound:
///   - Threshold decryption happens off-chain. settle() receives the plaintext the t+1
///     nodes recovered; it does not verify the nodes' decryption shares.
///   - Assets are internal ledger balances, not ERC-20 tokens, so no token transfers run.
///   - Price reports are posted in the clear rather than sealed.
///   - Both assets use 18 decimals. Prices are USDC per ETH, scaled by 1e18.
contract Mevres {
    uint256 private constant WAD = 1e18;
    uint256 public constant FEE_BPS = 30;       // 0.3% swap fee
    uint256 public constant ALPHA_BPS = 9000;   // share of the payment refunded to the user
    uint256 public constant MAX_REPORTS = 32;   // bounds the auction loop

    // MEVRES pool and a separate pool for the unprotected baseline
    uint256 public x;
    uint256 public y;
    uint256 public ux;
    uint256 public uy;

    enum State { None, Pending, Settled, Rejected, NoBid }

    struct Trade {
        bytes32 commitment;
        uint64 epoch;
        State state;
        address user;
        uint128 collateral;
    }

    struct Report {
        address bidder;
        uint256 price;
    }

    mapping(uint256 => Trade) public trades;
    mapping(uint64 => Report[]) private reportsOf;
    mapping(uint64 => bool) public biddingClosed;
    mapping(uint64 => bool) public rebalanced;

    mapping(address => int256) public balX;
    mapping(address => int256) public balY;
    uint256 public lpFeesX;
    uint256 public lpFeesY;
    uint256 public lpAuctionY;
    uint256 public userRefundsY;

    event Committed(uint256 indexed id, uint64 indexed epoch, bytes32 commitment, bytes ciphertext);
    event Reported(uint64 indexed epoch, address indexed bidder, uint256 price);
    event Settled(uint256 indexed id, address indexed winner, uint256 payment, uint256 userRefund);
    event BundleChecked(uint256 indexed id, uint256 frontIn, uint256 frontOut, uint256 afterSwapOut);
    event Rejected(uint256 indexed id);
    event NoBid(uint256 indexed id);
    event Rebalanced(uint64 indexed epoch, address indexed winner, uint256 payment, uint256 newX, uint256 newY);
    event Swapped(address indexed user, bool xToY, uint256 amountIn, uint256 amountOut);

    constructor() {
        x = 5_000 * WAD;
        y = 15_000_000 * WAD;
        ux = x;
        uy = y;
    }

    // ---------------------------------------------------------------- step 1

    function commit(uint256 id, uint64 epoch, bytes32 commitment, bytes calldata ciphertext) external payable {
        require(trades[id].state == State.None, "id used");
        require(!biddingClosed[epoch], "bidding closed");
        trades[id] = Trade(commitment, epoch, State.Pending, msg.sender, uint128(msg.value));
        emit Committed(id, epoch, commitment, ciphertext);
    }

    // ---------------------------------------------------------------- step 2

    function report(uint64 epoch, uint256 price) external {
        require(!biddingClosed[epoch], "bidding closed");
        require(reportsOf[epoch].length < MAX_REPORTS, "too many reports");
        require(price > 0, "zero price");
        reportsOf[epoch].push(Report(msg.sender, price));
        emit Reported(epoch, msg.sender, price);
    }

    // ---------------------------------------------------------------- steps 3-5

    /// @param xToY true for ETH -> USDC
    /// @param amountIn gross input, before the swap fee
    /// @param minOut the user's minimum output
    /// @param salt the salt committed together with the trade
    function settle(uint256 id, bool xToY, uint256 amountIn, uint256 minOut, bytes32 salt) external {
        Trade storage t = trades[id];
        require(t.state == State.Pending, "not pending");
        uint64 ep = t.epoch;
        if (!biddingClosed[ep]) biddingClosed[ep] = true;   // reports can no longer change

        if (keccak256(abi.encode(xToY, amountIn, minOut, salt)) != t.commitment) {
            t.state = State.Rejected;                         // collateral is forfeited
            emit Rejected(id);
            return;
        }

        uint256 fee = amountIn * FEE_BPS / 10_000;
        uint256 din = amountIn - fee;
        (uint256 w, int256 top, int256 second) = _auction(ep, xToY, din, minOut);
        if (top <= 0) {
            t.state = State.NoBid;
            _returnCollateral(t);
            emit NoBid(id);
            return;
        }
        uint256 pay = second > 0 ? uint256(second) : 0;
        _checkBundle(id, xToY, din, minOut);

        address winner = reportsOf[ep][w].bidder;
        uint256 refund = pay * ALPHA_BPS / 10_000;
        // The bundle starts and ends at the same pool state, so the reserves do not change:
        // the winner takes the user's net input and pays the user's minimum output plus the price.
        if (xToY) {
            balX[t.user] -= int256(amountIn);
            balY[t.user] += int256(minOut + refund);
            balX[winner] += int256(din);
            balY[winner] -= int256(minOut + pay);
            lpFeesX += fee;
        } else {
            balY[t.user] -= int256(amountIn);
            balX[t.user] += int256(minOut);
            balY[t.user] += int256(refund);
            balY[winner] += int256(din) - int256(pay);
            balX[winner] -= int256(minOut);
            lpFeesY += fee;
        }
        lpAuctionY += pay - refund;
        userRefundsY += refund;
        t.state = State.Settled;
        _returnCollateral(t);
        emit Settled(id, winner, pay, refund);
    }

    // ---------------------------------------------------------------- end of epoch

    /// @notice Auctions the move of the pool to the external price; the payment goes to LPs.
    function rebalance(uint64 ep) external {
        require(!rebalanced[ep], "already rebalanced");
        biddingClosed[ep] = true;
        rebalanced[ep] = true;
        Report[] storage r = reportsOf[ep];
        require(r.length > 0, "no reports");

        uint256 w;
        uint256 top;
        uint256 second;
        for (uint256 i; i < r.length; i++) {
            uint256 v = _rebalValue(r[i].price);
            if (v > top) { second = top; top = v; w = i; }
            else if (v > second) { second = v; }
        }
        if (top == 0) return;

        uint256 k = x * y;
        uint256 nx = _sqrt(k / r[w].price * WAD);
        uint256 ny = k / nx;
        address winner = r[w].bidder;
        balX[winner] += int256(x) - int256(nx);
        balY[winner] += int256(y) - int256(ny) - int256(second);
        lpAuctionY += second;
        x = nx;
        y = ny;
        emit Rebalanced(ep, winner, second, nx, ny);
    }

    // ---------------------------------------------------------------- baseline

    function swap(bool xToY, uint256 amountIn, uint256 minOut) external returns (uint256 out) {
        uint256 fee = amountIn * FEE_BPS / 10_000;
        uint256 din = amountIn - fee;
        if (xToY) {
            out = uy - ux * uy / (ux + din);
            require(out >= minOut, "slippage");
            ux += din;
            uy -= out;
            balX[msg.sender] -= int256(amountIn);
            balY[msg.sender] += int256(out);
            lpFeesX += fee;
        } else {
            out = ux - ux * uy / (uy + din);
            require(out >= minOut, "slippage");
            uy += din;
            ux -= out;
            balY[msg.sender] -= int256(amountIn);
            balX[msg.sender] += int256(out);
            lpFeesY += fee;
        }
        emit Swapped(msg.sender, xToY, amountIn, out);
    }

    // ---------------------------------------------------------------- views

    function quote(bool xToY, uint256 amountIn) external view returns (uint256) {
        uint256 din = amountIn - amountIn * FEE_BPS / 10_000;
        return xToY ? y - x * y / (x + din) : x - x * y / (y + din);
    }

    function reportCount(uint64 ep) external view returns (uint256) {
        return reportsOf[ep].length;
    }

    // ---------------------------------------------------------------- internals

    /// value of the sandwich bundle to a bidder who prices ETH at q (USDC, may be negative)
    function _bundleValue(uint256 q, bool xToY, uint256 din, uint256 minOut) private pure returns (int256) {
        return xToY
            ? int256(q * din / WAD) - int256(minOut)
            : int256(din) - int256(q * minOut / WAD);
    }

    function _auction(uint64 ep, bool xToY, uint256 din, uint256 minOut)
        private view returns (uint256 w, int256 top, int256 second)
    {
        Report[] storage r = reportsOf[ep];
        require(r.length > 0, "no reports");
        top = type(int256).min;
        second = type(int256).min;
        for (uint256 i; i < r.length; i++) {
            int256 v = _bundleValue(r[i].price, xToY, din, minOut);
            if (v > top) { second = top; top = v; w = i; }
            else if (v > second) { second = v; }
        }
    }

    /// Recomputes the bundle legs and checks the user's swap returns their minimum output.
    /// a is the reserve of the asset the user sells, b the reserve of the asset they buy.
    function _checkBundle(uint256 id, bool xToY, uint256 din, uint256 minOut) private {
        (uint256 a, uint256 b) = xToY ? (x, y) : (y, x);
        uint256 k = a * b;
        uint256 a1 = (_sqrt(din * din + 4 * (k / minOut) * din) - din) / 2;  // front-run state
        uint256 b1 = k / a1;
        uint256 b2 = k / (a1 + din);                                         // after the user's swap
        uint256 got = b1 - b2;
        uint256 diff = got > minOut ? got - minOut : minOut - got;
        require(diff <= minOut / 1e9 + 1, "bundle mismatch");
        // back-run returns the pool from (a1 + din, b2) to (a, b): nothing is left to store
        emit BundleChecked(id, a1, b1, b2);
    }

    /// profit from moving the pool to price q: (sqrt(q*x) - sqrt(y))^2
    function _rebalValue(uint256 q) private view returns (uint256) {
        uint256 qa = q * x / WAD;
        uint256 s = _sqrt(qa * y);
        return qa + y - 2 * s;
    }

    function _returnCollateral(Trade storage t) private {
        uint256 c = t.collateral;
        if (c == 0) return;
        t.collateral = 0;
        (bool ok, ) = t.user.call{value: c}("");
        require(ok, "collateral refund failed");
    }

    function _sqrt(uint256 n) private pure returns (uint256 r) {
        if (n == 0) return 0;
        r = n;
        uint256 z = (n >> 1) + 1;
        while (z < r) { r = z; z = (n / z + z) >> 1; }
    }
}
