# ZK API Usage Credits

Anonymous API access using zero-knowledge proofs. Deposit ETH once, then make API requests that can't be linked back to you — not by an eavesdropper, and not by the operator running the service.

Most paid API access today silently ties every request to a payment identity. There's no technical reason it has to. This project is an attempt to make unlinkable, prepaid API access a normal thing that exists — something anyone can run, fork, and build on.

Implementation of [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin.

> **Status:** working implementation, actively developed. Read [What this protects — and what it doesn't](#what-this-protects--and-what-it-doesnt) before relying on it for anything where your safety is at stake.

## How it works

1. **Deposit once.** You send ETH to a smart contract along with an identity commitment. This is the only step that touches your onchain identity.
2. **Prove, don't reveal.** For each request, your client generates a zero-knowledge proof that you have credits — without exposing your balance, your deposit, or your past requests.
3. **Request anonymously.** You submit the API request with the proof and a one-time nullifier. The operator verifies the proof and forwards the request. It can't tell which depositor you are.
4. **Unlinkable by design.** Each request uses a fresh nullifier, so two requests from the same person can't be correlated with each other.
5. **Get unused credits back.** Refund tickets let you redeem what you didn't spend, onchain.

The operator sees valid proofs and the requests it forwards. It does **not** see who you are or link your requests together. That property is enforced by cryptography, not by a policy promise.

## Features

- **Anonymous API access** — make requests without revealing your identity
- **Unlinkable requests** — a unique nullifier per request prevents correlation
- **Prove solvency, not balance** — ZK proofs confirm you can pay without exposing how much you have or what you've spent
- **Multi-provider** — provider abstraction supporting OpenAI, Stripe, and custom APIs
- **Trustless refunds** — automatic refund tickets for unused credits
- **TEE support** — deploy in Trusted Execution Environments (Phala Network, AWS Nitro Enclaves)
- **Production circuits** — Groth16 verifiers for withdrawal, refund, and slashing proofs
- **Privacy-preserving storage** — SQLite-based Merkle tree designed not to retain linkage
- **Tested** — 400+ unit tests plus end-to-end integration tests with real proofs

## What this protects — and what it doesn't

Privacy tooling is only as honest as its threat model. Here's the real boundary, stated plainly.

**It protects:**
- The link between your payment identity and your individual requests
- The correlation between two requests made by the same person
- Your balance and spending history from the operator and from observers

**It does not, on its own, protect:**
- **The content of your request from the upstream API provider.** If you query an LLM, that provider still sees the plaintext prompt. ZK-API hides *who* asked, not *what was asked* from the endpoint that answers it.
- **Network-layer identity.** Your IP can deanonymize you regardless of the proof. Use Tor or an equivalent if that's part of your threat model — this is not optional for adversaries who can watch the network.
- **Timing and metadata.** Request timing, frequency, and size can leak information. Batching and padding help; they don't make the problem disappear.
- **A compromised or malicious TEE.** TEE guarantees rest on hardware and vendor trust assumptions. A nation-state adversary is a different threat model than a curious operator, and this project does not claim to defeat the former.

If your safety depends on this, assume a sophisticated adversary and design accordingly — Tor, careful operational security, and an understanding that the upstream provider still sees your query. Don't treat "cryptographically unlinkable" as "safe." They are not the same sentence.

## Run it yourself

The most private deployment is the one where no third party — including this project's maintainer — is in the loop. Self-hosting is the intended path.

### Install

```
pnpm install
forge install
cp .env.template .env.local
```

### Test

```
# Unit tests (434 tests)
pnpm test

# End-to-end tests with real ZK proofs
pnpm test:e2e

# Contract tests (Foundry)
cd contracts && forge test -vv

# Integration tests (requires Anvil)
anvil                      # Terminal 1
pnpm test:zk               # Terminal 2 — basic contract tests
pnpm test:zk:integration   # Contract + verifier integration check
```

> **Note:** Production Groth16 verifiers are integrated, so tests requiring ZK proofs must generate real proofs via the backend API or use mock verifiers. See [scripts/README-TESTING.md](scripts/README-TESTING.md).

### Run locally

```
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

Server runs at `https://localhost:3000`. An EdDSA keypair auto-generates if not configured.

### Deploy to production

Production requires `NODE_ENV=production` and an `OPERATOR_PRIVATE_KEY`:

```
# Standard VPS
OPERATOR_PRIVATE_KEY=0x... pnpm start:prod

# Phala TEE (auto-injects secrets)
NODE_ENV=production

# Cloud KMS (AWS/GCP/Azure)
KMS_URL=https://kms.example.com/secrets
```

The operator private key is never written to disk. See [TEE_SETUP.md](docs/TEE_SETUP.md) and [PHALA_CONFIG.md](docs/PHALA_CONFIG.md) for production configurations. Running in a TEE is strongly recommended for any deployment serving users other than yourself — it's what lets users trust the operator without trusting you personally.

## Add your own provider

The provider layer is an abstraction — OpenAI, Stripe, and custom APIs plug in the same way. See [QUICK_START.md](docs/QUICK_START.md) to add a new provider in 10 steps.

## Documentation

**Core**
- [OVERVIEW.md](docs/OVERVIEW.md) — system architecture and status
- [QUICK_START.md](docs/QUICK_START.md) — add a new provider in 10 steps
- [LOCAL_SETUP.md](docs/LOCAL_SETUP.md) — local development setup
- [API_REFERENCE.md](docs/API_REFERENCE.md) — endpoints and request formats

**Zero-knowledge**
- [ZK.md](docs/ZK.md) — circuits and proofs
- [TRUSTED_SETUP_CEREMONY.md](docs/TRUSTED_SETUP_CEREMONY.md) — ceremony details and process
- [TESTING_GUIDE.md](docs/TESTING_GUIDE.md) — testing procedures
- [scripts/README-TESTING.md](scripts/README-TESTING.md) — testing with production verifiers

**Architecture**
- [PROVIDERS.md](docs/PROVIDERS.md) — provider abstraction design
- [SQLITE3.md](docs/SQLITE3.md) — database and privacy design

**Deployment**
- [TEE_SETUP.md](docs/TEE_SETUP.md) — production TEE deployment
- [PHALA_CONFIG.md](docs/PHALA_CONFIG.md) — Phala Cloud setup
- [DOCKER.md](docs/DOCKER.md) — Docker environment

## Contributing

This is built to be run, forked, and improved by people other than its author — that's the point. Issues and pull requests welcome, especially ones that tighten the privacy guarantees, sharpen the threat-model docs, or lower the friction of self-hosting.

## License

LGPL-3.0

## Credits

Based on [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin.

## Contact

**Julien Béranger** ([GitHub](https://github.com/julienbrg))

- Element: [@julienbrg:matrix.org](https://matrix.to/#/@julienbrg:matrix.org)
- Farcaster: [julien-](https://warpcast.com/julien-)
- Telegram: [@julienbrg](https://t.me/julienbrg)