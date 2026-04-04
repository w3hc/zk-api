# ZK API Usage Credits

Anonymous API access using zero-knowledge proofs. Users deposit ETH once and make unlimited anonymous requests without identity tracking or request linking.

Implementation of [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin.

## How It Works

1. Deposit ETH to smart contract with identity commitment
2. Generate zero-knowledge proof of solvency for each request
3. Submit anonymous API requests with proof and nullifier
4. Receive refund tickets for unused credits
5. Redeem refunds onchain

## Installation

```bash
pnpm install
forge install
cp .env.template .env.local
```

## Testing

```bash
# Unit tests
pnpm test

# End-to-end tests
pnpm test:e2e

# Integration tests (requires Anvil and API running)
anvil                # Terminal 1
pnpm start:dev       # Terminal 2
pnpm test:zk         # Terminal 3
```

## Running Locally

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

## Deployment

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

## Documentation

- [API_REFERENCE.md](docs/API_REFERENCE.md) - API endpoints and request formats
- [ZK.md](docs/ZK.md) - Zero-knowledge circuits and proofs
- [OVERVIEW.md](docs/OVERVIEW.md) - System architecture
- [TEE_SETUP.md](docs/TEE_SETUP.md) - Production TEE deployment
- [PHALA_CONFIG.md](docs/PHALA_CONFIG.md) - Phala Cloud setup
- [TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Testing procedures
- [SQLITE3.md](docs/SQLITE3.md) - Database and privacy design
- [LOCAL_SETUP.md](docs/LOCAL_SETUP.md) - Local development
- [DOCKER.md](docs/DOCKER.md) - Docker environment

## License

LGPL-3.0

## Acknowledgments

Based on [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin.

Built with the Wulong API template by [W3HC](https://github.com/w3hc/wulong).

## Contact

**Julien Béranger** ([GitHub](https://github.com/julienbrg))

- Element: [@julienbrg:matrix.org](https://matrix.to/#/@julienbrg:matrix.org)
- Farcaster: [julien-](https://warpcast.com/julien-)
- Telegram: [@julienbrg](https://t.me/julienbrg)

<img src="https://bafkreid5xwxz4bed67bxb2wjmwsec4uhlcjviwy7pkzwoyu5oesjd3sp64.ipfs.w3s.link" alt="built-with-ethereum-w3hc" width="100"/>