# ZK API

**Privacy-preserving Claude API access using Zero-Knowledge proofs and Rate-Limit Nullifiers**

ZK API enables anonymous access to Claude's AI models through a prepaid credit system backed by Ethereum smart contracts. Users deposit ETH once and make thousands of anonymous API requests without revealing their identity or linking requests together, using ZK-SNARK proofs and Rate-Limit Nullifiers (RLN).

Implementation based on the [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) proposal on Ethresear.ch.

## How it works

1. **Deposit** ETH to smart contract with anonymous identity commitment
2. **Generate** ZK proof of solvency for each API request
3. **Request** Claude API anonymously with proof and nullifier
4. **Receive** refund ticket for unused credits
5. **Redeem** accumulated refunds on-chain

## Install

```bash
git clone https://github.com/w3hc/zk-api.git
cd zk-api
pnpm install
forge install
cp .env.template .env.local
```

## Test

```bash
# Run all tests
pnpm test

# Test complete flow
bash scripts/test-complete-flow.sh
```

## Run

```bash
# Generate TLS certificates
mkdir -p secrets
openssl req -x509 -newkey rsa:4096 \
  -keyout secrets/tls.key \
  -out secrets/tls.cert \
  -days 365 -nodes \
  -subj "/CN=localhost"

# Generate EdDSA keypair
pnpm ts-node scripts/generate-admin-keypair.ts

# Start server
pnpm start:dev
```

API available at `https://localhost:3000`

## Docs

- [API_REFERENCE.md](docs/API_REFERENCE.md) - REST API endpoints and request/response formats
- [ZK.md](docs/ZK.md) - Zero-Knowledge circuits and cryptographic proofs
- [OVERVIEW.md](docs/OVERVIEW.md) - System architecture and design
- [LOCAL_SETUP.md](docs/LOCAL_SETUP.md) - Development setup without Docker
- [DOCKER.md](docs/DOCKER.md) - Docker development environment
- [TEE_SETUP.md](docs/TEE_SETUP.md) - Production deployment to TEE (AMD SEV-SNP, Intel TDX, AWS Nitro, Phala)
- [PHALA_CONFIG.md](docs/PHALA_CONFIG.md) - Phala Cloud configuration
- [TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Test procedures and verification scripts
- [TRUSTED_SETUP_CEREMONY.md](docs/TRUSTED_SETUP_CEREMONY.md) - Powers of Tau ceremony for ZK circuits
- [SQLITE3.md](docs/SQLITE3.md) - Persistent storage and privacy design
- [MLKEM.md](docs/MLKEM.md) - Post-quantum encryption implementation
- [SIWE.md](docs/SIWE.md) - Sign-In with Ethereum integration

## Credits

Inspired by the Ethresear.ch proposal [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin

Based on the **Wulong API template** by W3HC: https://github.com/w3hc/wulong

## License

GPL-3.0

## Contact

**Julien Béranger** ([GitHub](https://github.com/julienbrg))

- Element: [@julienbrg:matrix.org](https://matrix.to/#/@julienbrg:matrix.org)
- Farcaster: [julien-](https://warpcast.com/julien-)
- Telegram: [@julienbrg](https://t.me/julienbrg)

<img src="https://bafkreid5xwxz4bed67bxb2wjmwsec4uhlcjviwy7pkzwoyu5oesjd3sp64.ipfs.w3s.link" alt="built-with-ethereum-w3hc" width="100"/>
