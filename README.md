# ZK API Usage Credits

Anonymous API access using zero-knowledge proofs. Users deposit ETH once and make unlimited anonymous requests without identity tracking or request linking.

Implementation of [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin.

## Features

- **Anonymous API Access** - Make API requests without revealing your identity
- **Zero-Knowledge Proofs** - Prove solvency without exposing balance or transaction history
- **Unlinkable Requests** - Each request uses a unique nullifier, preventing request correlation
- **Multi-Provider Support** - Abstract provider layer supporting OpenAI, Stripe, and custom APIs
- **Trustless Refunds** - Automatically receive refund tickets for unused credits
- **Cryptographic Slashing** - Policy violations require ZK proofs binding nullifier, identity, and evidence
- **TEE Support** - Deploy in Trusted Execution Environments (Phala Network, AWS Nitro Enclaves)
- **Production-Ready Circuits** - Groth16 verifiers for withdrawal, refund, and slashing proofs
- **Persistent Storage** - SQLite-based Merkle tree with privacy-preserving design
- **Full Test Coverage** - 434+ unit tests plus end-to-end integration tests

## Workflow

1. Deposit ETH to smart contract with identity commitment
2. Generate zero-knowledge proof of solvency for each request
3. Submit anonymous API requests with proof and nullifier
4. Receive refund tickets for unused credits
5. Redeem refunds onchain

## Install

```bash
pnpm install
forge install
cp .env.template .env.local
```

## Test

```bash
# Unit tests (434 tests)
pnpm test

# End-to-end tests with real ZK proofs
pnpm test:e2e

# Contract tests (Foundry)
cd contracts && forge test -vv

# Integration tests (requires Anvil)
anvil                      # Terminal 1
pnpm test:zk               # Terminal 2 - Basic contract tests
pnpm test:zk:integration   # Or: Contract + verifier integration check
```

**Note**: Production Groth16 verifiers are integrated, so tests requiring ZK proofs must generate real proofs via the backend API or use mock verifiers. See [scripts/README-TESTING.md](scripts/README-TESTING.md) for details.

## Run

```bash
# Generate TLS certificates
mkdir -p secrets
openssl req -x509 -newkey rsa:4096 \
  -keyout secrets/tls.key \
  -out secrets/tls.cert \
  -days 365 -nodes \
  -subj "/CN=localhost"

# Start development server
pnpm start:dev
```

Server runs at `https://localhost:3000`. EdDSA keypair auto-generates if not configured.

## Deploy

Production deployment requires setting `NODE_ENV=production` and configuring `OPERATOR_PRIVATE_KEY`:

```bash
# Standard VPS
OPERATOR_PRIVATE_KEY=0x... pnpm start:prod

# Phala TEE (auto-injects secrets)
NODE_ENV=production

# Cloud KMS (AWS/GCP/Azure)
KMS_URL=https://kms.example.com/secrets
```

The operator private key is never stored on disk. See [TEE_SETUP.md](docs/TEE_SETUP.md) and [PHALA_CONFIG.md](docs/PHALA_CONFIG.md) for production configurations.

## Docs

### Core Documentation
- [OVERVIEW.md](docs/OVERVIEW.md) - System architecture and status
- [QUICK_START.md](docs/QUICK_START.md) - Add a new provider in 10 steps (OpenAI, Stripe, any API)
- [LOCAL_SETUP.md](docs/LOCAL_SETUP.md) - Local development setup
- [API_REFERENCE.md](docs/API_REFERENCE.md) - API endpoints and request formats

### ZK Implementation
- [ZK.md](docs/ZK.md) - Zero-knowledge circuits and proofs
- [TRUSTED_SETUP_CEREMONY.md](docs/TRUSTED_SETUP_CEREMONY.md) - Ceremony details and process
- [TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Testing procedures
- [scripts/README-TESTING.md](scripts/README-TESTING.md) - Testing with production verifiers

### Architecture
- [PROVIDERS.md](docs/PROVIDERS.md) - Provider abstraction architecture and design
- [SQLITE3.md](docs/SQLITE3.md) - Database and privacy design

### Deployment
- [TEE_SETUP.md](docs/TEE_SETUP.md) - Production TEE deployment
- [PHALA_CONFIG.md](docs/PHALA_CONFIG.md) - Phala Cloud setup
- [DOCKER.md](docs/DOCKER.md) - Docker environment

## License

LGPL-3.0

## Credits

Based on [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin.

Built with the [Wulong API template](https://github.com/w3hc/wulong) by [W3HC](https://github.com/w3hc).

## Contact

**Julien Béranger** ([GitHub](https://github.com/julienbrg))

- Element: [@julienbrg:matrix.org](https://matrix.to/#/@julienbrg:matrix.org)
- Farcaster: [julien-](https://warpcast.com/julien-)
- Telegram: [@julienbrg](https://t.me/julienbrg)

<img src="https://bafkreid5xwxz4bed67bxb2wjmwsec4uhlcjviwy7pkzwoyu5oesjd3sp64.ipfs.w3s.link" alt="built-with-ethereum-w3hc" width="100"/>