# ZK API Credits - Smart Contracts

Solidity smart contracts for privacy-preserving API credits system using Zero-Knowledge proofs and Rate-Limit Nullifiers (RLN).

## Overview

The ZkApiCredits contract implements:
- **Anonymous deposits** with identity commitments (Poseidon hash)
- **Dual staking** mechanism (RLN + Policy stakes)
- **Merkle tree** anonymity set using Poseidon hashing
- **Double-spend slashing** via RLN secret key extraction
- **Policy violation slashing** for ToS enforcement
- **Refund ticket redemption** with EdDSA signatures

## Contracts

### ZkApiCredits.sol
Main contract implementing the ZK API Credits protocol.

**Key Functions:**
- `deposit(bytes32 idCommitment)` - Deposit ETH with anonymous identity
- `withdraw(bytes32 idCommitment, address payable recipient, bytes32 secretKey)` - Withdraw funds
- `slashDoubleSpend(...)` - Slash double-spenders and reward reporters
- `slashPolicyViolation(...)` - Slash ToS violators (server only)
- `redeemRefund(...)` - Redeem server-signed refund tickets

### PoseidonHasher.sol
Wrapper library for Poseidon hash functions (uses poseidon-solidity).

**Critical:** This contract uses Poseidon hashing to maintain compatibility with the ZK circuit. Using Keccak256 would break proof verification.

## Building

Built with [Foundry](https://book.getfoundry.sh/).

### Prerequisites

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies (poseidon-solidity)
cd .. && pnpm install
```

### Compile

```bash
forge build
```

### Test

```bash
# Run all tests
forge test

# Run with verbosity
forge test -vvv

# Run specific test
forge test --match-test test_Deposit_Success

# Gas report
forge test --gas-report
```

**Test Results:**
```
✅ All 16 tests passing
✅ Identity commitments use Poseidon hash
✅ Merkle tree uses Poseidon hash
✅ Refund signatures verified with Poseidon hash
```

## Hash Function Compatibility ⚠️

**CRITICAL:** This contract uses **Poseidon** hashing, not Keccak256.

| Operation | Hash Function | Reason |
|-----------|---------------|--------|
| Identity commitments | Poseidon | Must match ZK circuit |
| Merkle tree | Poseidon | Must match ZK circuit |
| Refund signatures | Poseidon | Must match ZK circuit |
| Double-spend detection | Poseidon | Must match ZK circuit |

The circuit uses `circomlib/Poseidon`, and the contract uses `poseidon-solidity`. These are cryptographically identical.

**See:** [CHANGELOG_HASH_FIX.md](../docs/notes/CHANGELOG_HASH_FIX.md) for details on hash function compatibility.

## Deployment

### Local (Anvil)

```bash
# Terminal 1: Start local node
anvil

# Terminal 2: Deploy contract
forge script script/Deploy.s.sol:DeployScript --rpc-url http://127.0.0.1:8545 --broadcast
```

### Testnet

```bash
# Set environment variables
export PRIVATE_KEY=0x...
export RPC_URL=https://sepolia.infura.io/v3/...

# Deploy
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

### Required Constructor Parameters

```solidity
constructor(
    address _serverAddress,      // Server address for policy slashing
    uint256 _minRlnStake,        // Minimum RLN stake (e.g., 0.005 ether)
    uint256 _minPolicyStake,     // Minimum policy stake (e.g., 0.005 ether)
    bytes32 _serverPubKeyX,      // Server EdDSA public key X coordinate
    bytes32 _serverPubKeyY       // Server EdDSA public key Y coordinate
)
```

## Dependencies

### npm Packages (via remappings)
- **poseidon-solidity** - Production-ready Poseidon hash implementation matching circomlib

### Foundry Libraries
- **forge-std** - Foundry testing utilities
- **openzeppelin-contracts** - ReentrancyGuard, Pausable, Ownable

### Remappings

See [remappings.txt](./remappings.txt):
```
poseidon-solidity/=../node_modules/poseidon-solidity/
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
forge-std/=lib/forge-std/src/
```

## Gas Optimization

Current gas costs (approximate):
- Deposit: ~220k gas
- Withdraw: ~225k gas
- Redeem refund: ~150k gas
- Slash double-spend: ~265k gas

**Future optimizations:**
- Incremental Merkle tree for cheaper deposits
- Batch refund redemption
- Storage packing

## Security

### Audits
⚠️ **Not yet audited** - Do not use in production without professional audit.

### Known Limitations
1. **Simplified Merkle tree** - Uses basic Poseidon hashing, not optimized incremental tree
2. **Placeholder EdDSA verification** - Accepts all non-zero signatures (TODO: real verification)
3. **No proof verification** - ZK proof verification not yet implemented on-chain

### Security Model
- **RLN stake** - Claimable by anyone proving double-spend
- **Policy stake** - Burned (sent to address(0)) for ToS violations
- **Refund nullifiers** - Prevents double-redemption
- **Secret key extraction** - Enables slashing of double-spenders

## Development Commands

```bash
# Build contracts
forge build

# Run tests
forge test

# Run tests with gas report
forge test --gas-report

# Format code
forge fmt

# Generate documentation
forge doc

# Coverage report
forge coverage

# Deploy to local testnet
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Interact with contract
cast call <CONTRACT_ADDRESS> "merkleRoot()" --rpc-url http://localhost:8545
```

## Architecture

```
contracts/
├── src/
│   ├── ZkApiCredits.sol       # Main contract
│   └── PoseidonHasher.sol     # Poseidon hash wrapper
├── test/
│   └── ZkApiCredits.t.sol     # Foundry tests
├── script/
│   └── Deploy.s.sol           # Deployment script
├── lib/                        # Foundry dependencies
├── remappings.txt             # Import path mappings
└── foundry.toml               # Foundry configuration
```

## Related Documentation

- [Smart Contract Overview](../docs/OVERVIEW.md#smart-contracts)
- [ZK Proof System](../docs/ZK.md)
- [Implementation Plan](../docs/notes/IMPLEMENTATION_PLAN.md)
- [Hash Function Fix Changelog](../docs/notes/CHANGELOG_HASH_FIX.md)
- [Testing Guide](../docs/TESTING_GUIDE.md)

## Foundry Resources

- [Foundry Book](https://book.getfoundry.sh/) - Complete Foundry documentation
- [Forge CLI Reference](https://book.getfoundry.sh/reference/forge/)
- [Cast CLI Reference](https://book.getfoundry.sh/reference/cast/)
- [Anvil Documentation](https://book.getfoundry.sh/reference/anvil/)

## Contributing

When modifying contracts:
1. **Maintain Poseidon hash compatibility** - Never replace with Keccak256
2. **Run all tests** - `forge test`
3. **Check gas usage** - `forge test --gas-report`
4. **Format code** - `forge fmt`
5. **Update tests** - Add tests for new functionality
6. **Document changes** - Update this README and related docs

## License

MIT
