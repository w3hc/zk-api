# ZK API Usage Credits: Privacy-Preserving Claude API Access

## Overview

This document describes the implementation of a Zero-Knowledge API usage credit system based on the [Ethresear.ch proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis and Vitalik Buterin. The system enables users to access Claude API services with full privacy while paying in ETH, using Rate-Limit Nullifiers (RLN) to prevent double-spending without revealing identity.

## Core Problem

Traditional API metering forces a tradeoff:
1. **Web2 Identity**: Requires email/credit card, linking every request to real-world identity
2. **On-Chain Payments**: Requires a transaction per request, which is slow and expensive

Our solution: **Deposit ETH once, make thousands of anonymous Claude API calls**

## System Architecture

### Components

1. **Smart Contract** (Ethereum)
   - User deposit management
   - Merkle tree of identity commitments
   - Slashing mechanism for double-spenders
   - Dual staking (RLN stake + Policy stake)

2. **ZK Proof System** (ZK-STARK)
   - Proves sufficient balance without revealing identity
   - Implements Rate-Limit Nullifiers
   - Verifies refund accumulation

3. **API Server** (NestJS - extends ZK API)
   - Claude API proxy with usage metering
   - Proof verification
   - Refund ticket issuance
   - Nullifier tracking (double-spend detection)

4. **ETH/USD Rate Oracle**
   - Fetches Kraken ETH/USD exchange rate
   - Converts Claude token costs to ETH

## Technical Design

### 1. Primitives

- `k`: User's secret key (never revealed)
- `ID = Hash(k)`: Identity commitment stored on-chain
- `D`: Initial deposit in ETH
- `S`: Policy stake (slashable for ToS violations, but burned not claimed)
- `C_max`: Maximum cost per request (deducted upfront)
- `i`: Ticket index (strictly increasing counter: 0, 1, 2, ...)
- `{r_1, r_2, ..., r_n}`: Collection of signed refund tickets

### 2. Protocol Flow

#### Registration
1. User generates secret `k` locally
2. Derives identity commitment `ID = Hash(k)`
3. Deposits `Total = D + S` in ETH to smart contract
4. Contract inserts `ID` into Merkle tree

#### Request Generation (Parallelizable)
User picks next ticket index `i` and generates ZK-STARK proof `π_req` proving:

1. **Membership**: `ID ∈ MerkleRoot`
2. **Refund Summation**:
   - Verifies server signatures on all refund tickets `{r_1, ..., r_n}`
   - Calculates total refunds: `R = Σ v_j`
3. **Solvency**: `(i + 1) × C_max ≤ D + R`
4. **RLN Share & Nullifier**:
   - Slope: `a = Hash(k, i)`
   - Signal: `x = Hash(M)`, `y = k + a × x`
   - Nullifier: `Nullifier = Hash(a)`

User submits: `(Payload, Nullifier, (x, y), π_req)`

#### Verification & Execution
1. **Nullifier Check**: Server queries "spent tickets" database
   - If nullifier exists with different `x` → double-spend detected → extract `k` from two signals → SLASH
   - If new → store nullifier and proceed
2. **Proof Verification**: Verify `π_req` ZK-STARK
3. **Execute Request**: Forward to Claude API
4. **Calculate Actual Cost**: Token usage × Claude pricing
5. **Issue Refund**: `r = C_max - C_actual`, signed by server
6. **Return Response**: Claude response + signed refund ticket

#### Cost Calculation

```typescript
// Claude API Pricing (March 2026)
const CLAUDE_PRICING = {
  'claude-opus-4.6': { input: 5, output: 25 },      // USD per million tokens
  'claude-sonnet-4.6': { input: 3, output: 15 },
  'claude-haiku-4.5': { input: 1, output: 5 }
};

// Fetch ETH/USD rate from Kraken
async function getEthUsdRate(): Promise<number> {
  const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=ETHUSD');
  const data = await response.json();
  return parseFloat(data.result.XETHZUSD.c[0]); // Last trade price
}

// Convert Claude token cost to ETH
async function calculateCostInETH(
  inputTokens: number,
  outputTokens: number,
  model: string
): Promise<bigint> {
  const pricing = CLAUDE_PRICING[model];
  const costUSD = (inputTokens / 1_000_000) * pricing.input
                + (outputTokens / 1_000_000) * pricing.output;

  const ethUsdRate = await getEthUsdRate();
  const costETH = costUSD / ethUsdRate;

  return BigInt(Math.ceil(costETH * 1e18)); // Convert to wei
}
```

### 3. Dual Staking for Policy Enforcement

Total deposit: `Total = D + S`

- **D (RLN Stake)**: Claimable by anyone who proves double-spending (provides two valid signatures revealing `k`)
- **S (Policy Stake)**: Burned (not claimed) by server for ToS violations (e.g., prohibited content)

This prevents servers from profiting by falsely banning users while still allowing enforcement.

### 4. Alternative: Homomorphic Refund Accumulation

Instead of maintaining growing refund ticket list, use additively homomorphic encryption (Pedersen Commitments or Lattice-based):

- User maintains encrypted balance `E(R)` with server signature `σ_srv`
- Server homomorphically updates: `E(R_new) = E(R) ⊕ E(r)`
- Signs new commitment: `σ_new = Sign_srv(E(R_new))`
- ZK circuit verifies signature and proves knowledge of plaintext `R`

**Benefit**: Constant client-side data and ZK circuit complexity

## Implementation Plan

### Phase 1: Smart Contract (Solidity)

```solidity
contract ZkApiCredits {
    struct Deposit {
        bytes32 idCommitment;
        uint256 rlnStake;      // D
        uint256 policyStake;   // S
        uint256 timestamp;
    }

    mapping(bytes32 => Deposit) public deposits;
    mapping(bytes32 => bool) public slashedNullifiers;
    bytes32 public merkleRoot;

    function deposit(bytes32 _idCommitment) external payable;
    function withdraw(bytes32 _idCommitment, uint256 _amount) external;
    function slashDoubleSpend(bytes32 _secretKey, Proof memory _proof) external;
    function slashPolicyViolation(bytes32 _nullifier, bytes32 _evidence) external;
}
```

**Key Functions**:
- `deposit()`: Accept ETH, insert ID commitment into Merkle tree
- `slashDoubleSpend()`: Accept revealed `k` + proof, reward slasher with `D`
- `slashPolicyViolation()`: Burn `S` (not transfer to server)
- `withdraw()`: Allow users to withdraw remaining funds

### Phase 2: ZK Circuit (Circom or Noir)

```rust
// Circuit inputs (private)
circuit ApiCreditProof {
    // Private inputs
    private_input secret_key: Field;
    private_input merkle_proof: MerkleProof;
    private_input refund_tickets: Vec<RefundTicket>;
    private_input ticket_index: u64;

    // Public inputs
    public_input merkle_root: Field;
    public_input nullifier: Field;
    public_input signal_x: Field;
    public_input signal_y: Field;
    public_input max_cost: u64;
    public_input initial_deposit: u64;

    fn main() {
        // 1. Verify membership
        let id = hash(secret_key);
        assert(merkle_proof.verify(id, merkle_root));

        // 2. Verify refund summation
        let total_refunds = refund_tickets.iter()
            .map(|ticket| {
                assert(verify_signature(ticket, server_pubkey));
                ticket.value
            })
            .sum();

        // 3. Solvency check
        assert((ticket_index + 1) * max_cost <= initial_deposit + total_refunds);

        // 4. RLN nullifier
        let a = hash(secret_key, ticket_index);
        let nullifier_computed = hash(a);
        assert(nullifier == nullifier_computed);

        // 5. RLN signal
        let y_computed = secret_key + a * signal_x;
        assert(signal_y == y_computed);
    }
}
```

### Phase 3: NestJS API Service

Extends existing ZK API architecture:

```typescript
// src/zk-api/dto/api-request.dto.ts
export class ZkApiRequestDto {
  payload: string;              // Encrypted prompt for Claude
  nullifier: string;            // RLN nullifier (prevents double-spend)
  signal: { x: string; y: string };  // RLN signal (for slashing)
  proof: string;                // ZK-STARK proof
  maxCost: string;              // Maximum cost user is willing to pay (in wei)
}

// src/zk-api/zk-api.service.ts
@Injectable()
export class ZkApiService {
  constructor(
    private readonly claudeClient: AnthropicClient,
    private readonly nullifierStore: NullifierStore,
    private readonly proofVerifier: ProofVerifier,
    private readonly ethRateOracle: EthRateOracle,
    private readonly signingService: SigningService
  ) {}

  async handleRequest(req: ZkApiRequestDto): Promise<ApiResponse> {
    // 1. Check nullifier for double-spend
    const existingSignal = await this.nullifierStore.get(req.nullifier);
    if (existingSignal && existingSignal.x !== req.signal.x) {
      // Double-spend detected! Extract secret key
      const secretKey = this.extractSecretKey(
        existingSignal,
        req.signal
      );
      await this.slashUser(secretKey);
      throw new ForbiddenException('Double-spend detected');
    }

    // 2. Verify ZK proof
    const valid = await this.proofVerifier.verify(req.proof);
    if (!valid) {
      throw new UnauthorizedException('Invalid proof');
    }

    // 3. Store nullifier
    await this.nullifierStore.set(req.nullifier, req.signal);

    // 4. Execute Claude API request
    const response = await this.claudeClient.messages.create({
      model: 'claude-opus-4.6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: req.payload }]
    });

    // 5. Calculate actual cost in ETH
    const actualCost = await this.calculateCostInETH(
      response.usage.input_tokens,
      response.usage.output_tokens,
      'claude-opus-4.6'
    );

    // 6. Generate refund ticket
    const refundValue = BigInt(req.maxCost) - actualCost;
    const refundTicket = await this.signingService.signRefund({
      nullifier: req.nullifier,
      value: refundValue.toString(),
      timestamp: Date.now()
    });

    return {
      response: response.content,
      actualCost: actualCost.toString(),
      refundTicket,
      usage: response.usage
    };
  }

  private extractSecretKey(
    signal1: { x: string; y: string },
    signal2: { x: string; y: string }
  ): string {
    // Given y1 = k + a*x1 and y2 = k + a*x2
    // We can solve: k = (y1*x2 - y2*x1) / (x2 - x1)
    const x1 = BigInt(signal1.x);
    const y1 = BigInt(signal1.y);
    const x2 = BigInt(signal2.x);
    const y2 = BigInt(signal2.y);

    const k = (y1 * x2 - y2 * x1) / (x2 - x1);
    return k.toString();
  }
}

// src/zk-api/eth-rate-oracle.service.ts
@Injectable()
export class EthRateOracle {
  private cache: { rate: number; timestamp: number } | null = null;
  private readonly CACHE_TTL = 60_000; // 1 minute

  async getEthUsdRate(): Promise<number> {
    const now = Date.now();
    if (this.cache && now - this.cache.timestamp < this.CACHE_TTL) {
      return this.cache.rate;
    }

    const response = await fetch(
      'https://api.kraken.com/0/public/Ticker?pair=ETHUSD'
    );
    const data = await response.json();

    if (data.error?.length > 0) {
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    const rate = parseFloat(data.result.XETHZUSD.c[0]);
    this.cache = { rate, timestamp: now };

    return rate;
  }
}
```

### Phase 4: Client SDK

```typescript
// zk-api-client/src/client.ts
export class ZkApiClient {
  private secretKey: bigint;
  private idCommitment: string;
  private ticketIndex: number = 0;
  private refundTickets: RefundTicket[] = [];

  constructor(
    private readonly apiUrl: string,
    private readonly contract: ZkApiCreditsContract
  ) {
    this.secretKey = this.generateSecretKey();
    this.idCommitment = this.hash(this.secretKey);
  }

  async deposit(amountETH: string): Promise<void> {
    await this.contract.deposit(this.idCommitment, {
      value: parseEther(amountETH)
    });
  }

  async sendPrompt(
    prompt: string,
    maxCostETH: string
  ): Promise<ClaudeResponse> {
    // 1. Get Merkle proof for identity
    const merkleProof = await this.contract.getMerkleProof(this.idCommitment);

    // 2. Generate ZK proof
    const proof = await this.generateProof({
      secretKey: this.secretKey,
      merkleProof,
      refundTickets: this.refundTickets,
      ticketIndex: this.ticketIndex,
      maxCost: parseEther(maxCostETH)
    });

    // 3. Compute nullifier and signal
    const a = this.hash(this.secretKey, this.ticketIndex);
    const nullifier = this.hash(a);
    const x = this.hash(prompt);
    const y = this.secretKey + a * x;

    // 4. Send request
    const response = await fetch(`${this.apiUrl}/zk-api/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: prompt,
        nullifier: nullifier.toString(),
        signal: { x: x.toString(), y: y.toString() },
        proof: proof.toString(),
        maxCost: parseEther(maxCostETH).toString()
      })
    });

    const result = await response.json();

    // 5. Store refund ticket
    this.refundTickets.push(result.refundTicket);
    this.ticketIndex++;

    return result;
  }
}
```

## Deployment Architecture

```
┌─────────────────┐
│   User Client   │
│  (Browser/CLI)  │
└────────┬────────┘
         │
         │ ZK Proof + Nullifier
         ▼
┌─────────────────────────────────┐
│     ZK API Service              │
│                                 │
│  ┌──────────────────────────┐  │
│  │  Proof Verifier          │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │  Nullifier Store (Redis) │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │  ETH Rate Oracle         │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │  Refund Signer           │  │
│  └──────────────────────────┘  │
└──────────┬──────────────────────┘
           │
           │ Anthropic API Call
           ▼
┌─────────────────────┐
│   Claude API        │
│  (Anthropic)        │
└─────────────────────┘

           │
           ▼
┌─────────────────────┐     ┌──────────────────┐
│  Ethereum Mainnet   │────▶│  Kraken API      │
│  (Smart Contract)   │     │  (ETH/USD Rate)  │
└─────────────────────┘     └──────────────────┘
```

## Cost Examples

Using Claude Opus 4.6 (most advanced model):
- Input: $5 per million tokens
- Output: $25 per million tokens
- Assume ETH = $2,000 USD

### Example 1: Simple Q&A
- Input: 100 tokens (~75 words)
- Output: 400 tokens (~300 words)
- Cost: (100/1M × $5) + (400/1M × $25) = $0.0105
- **ETH cost**: 0.00000525 ETH (~$0.0105)

### Example 2: Code Generation
- Input: 500 tokens (detailed prompt)
- Output: 2000 tokens (code + explanation)
- Cost: (500/1M × $5) + (2000/1M × $25) = $0.0525
- **ETH cost**: 0.00002625 ETH (~$0.0525)

### Example 3: Long Document Analysis
- Input: 10,000 tokens (document)
- Output: 1,000 tokens (summary)
- Cost: (10K/1M × $5) + (1K/1M × $25) = $0.075
- **ETH cost**: 0.0000375 ETH (~$0.075)

## Security Considerations

1. **Double-Spend Prevention**: RLN ensures reusing same ticket index with different message reveals secret key
2. **Privacy**: Requests cannot be linked to identity or each other (via nullifiers)
3. **Solvency**: ZK proof ensures user has sufficient balance without revealing amount
4. **Server Accountability**: Policy stake is burned (not claimed) to prevent false banning for profit
5. **Frontrunning**: Nullifier is deterministic per ticket index, preventing MEV attacks

## User Workflow: Simple Conversation with Claude

### First-Time Setup (One-time, ~2 minutes)

1. **Visit Application**: Navigate to the ZK API web interface
2. **Passkey Authentication** (using [W3PK](https://w3pk.w3hc.org/)):
   - Click "Create Account"
   - Browser prompts: "Create a passkey for this site?"
   - Touch fingerprint sensor / Face ID / security key
   - **Done** - No passwords, no seed phrases, no manual key management
   - W3PK generates Ethereum wallet automatically using WebAuthn
3. **Initial Deposit**:
   - View recommended deposit: "0.01 ETH (~$20 = ~400 Claude requests)"
   - Click "Deposit ETH"
   - Approve transaction (standard MetaMask/wallet, or W3PK-integrated)
   - Behind the scenes:
     - Client generates secret key `k` locally (never leaves device)
     - Derives identity commitment `ID = Hash(k)`
     - Deposits to smart contract
     - Contract adds `ID` to anonymity set

**User sees**: Simple fingerprint authentication + single ETH deposit
**User doesn't see**: ZK circuits, Merkle trees, nullifiers, RLN math

### Every Conversation (Seamless, ~1 second overhead)

1. **Ask Question**:
   ```
   User: "Explain quantum computing in simple terms"
   ```

2. **Automatic Processing** (invisible to user):
   - Generate ZK proof (proves you have credit without revealing who you are)
   - Compute nullifier (prevents double-spending)
   - Send encrypted request to server

3. **Receive Response**:
   ```
   Claude: [Detailed explanation of quantum computing...]

   Cost: 0.00001 ETH (~$0.02)
   Remaining Balance: 0.00999 ETH (~399 requests left)
   ```

4. **Continue Conversation**:
   - Each message is completely unlinkable
   - No login required (passkey auto-authenticates)
   - No manual transactions
   - Server cannot tell it's the same person

### W3PK Integration: Seamless UX

[W3PK](https://w3pk.w3hc.org/) is a passwordless Web3 authentication SDK that provides:

- **No Seed Phrases**: Uses WebAuthn (passkeys) instead of traditional private keys
- **Native Browser Support**: Touch ID, Face ID, Windows Hello, YubiKey
- **Encrypted Wallets**: Keys stored securely in device hardware (TPM/Secure Enclave)
- **Privacy by Default**: No email, no phone, no KYC
- **Multi-Device Sync**: Passkeys sync via iCloud Keychain / Google Password Manager
- **Account Recovery**: Social recovery without seed phrases
- **Persistent Sessions**: WebAuthn credentials persist across browsing sessions
  - No repeated login prompts
  - Credentials stored in browser/OS credential manager
  - Automatic authentication when returning to the app
  - Works across private/incognito mode boundaries (with user consent)

**Why W3PK?**
Traditional Web3 requires users to:
1. Install MetaMask/wallet extension
2. Write down 12-24 word seed phrase
3. Understand "gas", "nonce", "wei"
4. Sign cryptic transaction data

With W3PK, users:
1. Touch fingerprint sensor
2. Done ✓

**Persistent Session Flow**:
- **First visit**: Create passkey → deposit ETH → start using
- **Return visits**: Touch fingerprint → immediately authenticated
- **Secret key `k`** stays in browser's IndexedDB (encrypted)
- **Refund tickets** accumulate automatically in local storage
- User never manages keys manually

### Comparison: ZK API vs Venice AI

| Feature | **ZK API** | **Venice AI** | Winner |
|---------|---------------------|---------------|---------|
| **Privacy Architecture** | Cryptographic (ZK proofs + RLN) | Trust-based (contractual + TEE) | 🏆 ZK API |
| **Identity Unlinkability** | ✅ Mathematically guaranteed | ⚠️ Depends on TEE implementation | 🏆 ZK API |
| **Request Unlinkability** | ✅ Each request uses unique nullifier | ⚠️ TEE mode only | 🏆 ZK API |
| **Data Retention** | ❌ Never stored (cryptographically enforced) | ⚠️ Depends on mode (trust required) | 🏆 ZK API |
| **Verifiable Privacy** | ✅ On-chain proof verification | ⚠️ Remote attestation (Venice.ai + Phala/NEAR) | 🏆 ZK API |
| **Payment Model** | Crypto-native (ETH, anonymous) | Fiat credit card (identity-linked) | 🏆 ZK API |
| **Censorship Resistance** | ✅ Permissionless (anyone can run server) | ❌ Centralized (Venice.ai controls) | 🏆 ZK API |
| **Upfront Cost** | Deposit required (~$20 minimum) | $0 (credit card billing) | Venice AI |
| **Model Access** | Claude Opus 4.6 (SOTA) | Multiple models (GPT-4, Claude, Llama, etc.) | Venice AI |
| **Setup Complexity** | Medium (passkey + ETH deposit) | Low (email + card) | Venice AI |
| **Audit Status** | Open-source, auditable smart contracts | No independent audits (as of Sept 2025) | 🏆 ZK API |

**Key Differences**:

1. **Trust Model**:
   - **ZK API**: Zero-knowledge = zero trust. Privacy guaranteed by math, not promises
   - **Venice AI**: Trusted Execution Environments + contractual agreements. You trust Venice.ai + TEE hardware vendors

2. **Privacy Modes**:
   - **ZK API**: One mode = full privacy for all requests
   - **Venice AI**: Four modes with varying privacy levels:
     - Anonymous (Venice proxies, but providers may log)
     - Private (contractual promise)
     - TEE (hardware isolation)
     - E2EE (encrypted + TEE)

3. **Anonymity Set**:
   - **ZK API**: You're anonymous within all users who deposited to the contract (growing set)
   - **Venice AI**: You're pseudonymous per session/account

4. **Server Accountability**:
   - **ZK API**: Dual staking prevents server from profiting by false bans (policy stake is burned)
   - **Venice AI**: Server controls bans with no economic penalty

5. **Decentralization**:
   - **ZK API**: Anyone can run a server, verify proofs, and accept payments
   - **Venice AI**: Single company operates the service

**When to Choose ZK API**:
- Maximum privacy (e.g., dissidents, journalists, sensitive research)
- Crypto-native users (already have ETH)
- Desire for verifiable, trustless privacy
- Willing to pay upfront deposit

**When to Choose Venice AI**:
- Want multiple AI models (GPT-4, Gemini, etc.)
- Prefer traditional payment (credit card)
- Need "good enough" privacy with less friction
- Don't want to manage crypto

## Benefits Over Alternatives

| Approach | Privacy | Cost per Request | Unlinkability | Spam Protection | Trust Required |
|----------|---------|------------------|---------------|-----------------|----------------|
| Web2 (email/card) | ❌ | Low | ❌ | ✅ | High (full identity) |
| On-chain per request | ⚠️ Pseudonymous | High (gas) | ❌ | ✅ | Medium (blockchain only) |
| Venice AI (TEE mode) | ⚠️ Hardware + Contract | Low | ⚠️ Per-session | ✅ | Medium (TEE + Venice) |
| **ZK Credits (ours)** | ✅ Cryptographic | Very Low | ✅ Per-request | ✅ | None (trustless) |

## Payment Options

### Option 1: Direct ETH Deposit (Most Private)
- User sends ETH from any wallet to smart contract
- Full anonymity maintained
- No identity linking

### Option 2: Stripe Integration (Convenience)
For users without ETH, we offer an optional **"Refill Your Wallet in ETH"** feature:

```typescript
// Stripe → ETH Bridge Flow
1. User clicks "Buy ETH Credits with Card"
2. Stripe checkout: Enter card details + amount (USD)
3. Backend purchases ETH via Kraken/Coinbase API
4. ETH sent to user's W3PK-generated address
5. User deposits to ZK contract (step 3 is manual or automated)
```

**Privacy Implications**:
- ⚠️ **Stripe knows**: Card holder identity + USD amount
- ⚠️ **Kraken/Exchange knows**: ETH destination address (1 hop away from ZK contract)
- ✅ **API Server doesn't know**: ZK proof still hides identity during usage
- ✅ **Mitigation**: User can mix through Tornado Cash or use fresh wallet

**Implementation**:
```typescript
// src/payment/stripe.service.ts
@Injectable()
export class StripePaymentService {
  async createCheckoutSession(amountUSD: number): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'ETH Credits for ZK API' },
          unit_amount: amountUSD * 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/deposit-success`,
      cancel_url: `${process.env.FRONTEND_URL}/deposit-cancel`,
    });
    return session.url;
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // 1. Get ETH/USD rate
      const ethRate = await this.ethRateOracle.getEthUsdRate();
      const ethAmount = session.amount_total / 100 / ethRate;

      // 2. Purchase ETH via exchange API
      const userAddress = session.metadata.w3pkAddress;
      await this.exchangeAPI.buyAndSendETH(ethAmount, userAddress);

      // 3. Notify user to complete deposit
      await this.notificationService.send(userAddress, {
        type: 'eth_received',
        amount: ethAmount,
        nextStep: 'deposit_to_contract'
      });
    }
  }
}
```

**User Flow with Stripe**:
1. "I don't have ETH" → Click "Buy with Card"
2. Pay $20 USD via Stripe
3. Receive 0.01 ETH to W3PK wallet (takes 2-5 minutes)
4. Click "Deposit to ZK Contract" (one transaction)
5. Start using API anonymously

**Trade-offs**:
| Method | Privacy | Convenience | Speed |
|--------|---------|-------------|-------|
| Direct ETH deposit | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Stripe + Mixer | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Stripe (no mixer) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

## EIP-7702 Delegation: Seamless UX from Existing Accounts

[EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) (active in Pectra upgrade) allows **EOAs to temporarily execute smart contract code**, enabling advanced Account Abstraction features.

### Use Case: Delegate from Your Main Wallet

Instead of creating a new W3PK wallet, users can **delegate** from their existing MetaMask/Coinbase wallet:

```solidity
// User's existing EOA (e.g., 0xAlice) delegates to ZK API contract
// This enables batch transactions, gas sponsorship, and more
```

**User Flow**:
1. **Connect MetaMask**: "I already have ETH in my MetaMask wallet"
2. **Sign EIP-7702 Authorization**: One-time signature (no gas)
3. **Delegate Code**: EOA temporarily gains smart contract capabilities
4. **Deposit + Batch Setup**: Single transaction does:
   - Deposit ETH to ZK contract
   - Generate identity commitment `ID`
   - Store encrypted secret key `k` in browser
5. **Start Using**: No W3PK setup needed, use existing wallet

**Code Example**:
```typescript
// EIP-7702 Authorization
const authorization = {
  chainId: 1,
  address: zkApiDelegationContract, // 0x...
  nonce: await provider.getTransactionCount(userAddress),
};

const signature = await signer.signTypedData({
  domain: { name: 'ZK API Delegation', version: '1', chainId: 1 },
  types: { Authorization: [
    { name: 'chainId', type: 'uint256' },
    { name: 'address', type: 'address' },
    { name: 'nonce', type: 'uint64' },
  ]},
  message: authorization,
});

// Send EIP-7702 transaction (type 0x04)
const tx = await provider.sendTransaction({
  type: 4, // EIP-7702
  authorizationList: [{ ...authorization, ...signature }],
  to: zkApiDelegationContract,
  data: encodeFunctionData({
    abi: zkApiAbi,
    functionName: 'depositAndSetup',
    args: [idCommitment]
  }),
  value: parseEther('0.01'), // Deposit amount
});
```

### Privacy Implications of EIP-7702 Delegation

| Aspect | Impact | Severity |
|--------|--------|----------|
| **On-Chain Linkability** | ❌ Your EOA address is visible in delegation tx | 🔴 **HIGH** |
| **Request Unlinkability** | ✅ ZK proofs still hide which EOA is making requests | 🟢 **LOW** |
| **Deposit Anonymity** | ❌ Observers can see EOA deposited X ETH | 🔴 **HIGH** |
| **Balance Privacy** | ✅ ZK proofs don't reveal remaining balance | 🟢 **LOW** |
| **Usage Pattern Privacy** | ✅ Nullifiers prevent linking individual requests | 🟢 **LOW** |

**Privacy Score**: ⭐⭐⭐ (vs ⭐⭐⭐⭐⭐ for fresh W3PK wallet)

**Detailed Privacy Analysis**:

1. **What's Compromised**:
   - Anyone can see: "Address 0xAlice deposited 0.1 ETH to ZK API contract at block X"
   - If your EOA is KYC'd (e.g., withdrew from Coinbase), your identity is linked to the deposit
   - Total deposit amount is public

2. **What's Still Private**:
   - Individual API requests remain unlinkable (thanks to RLN nullifiers)
   - Server can't tell which deposit is making which request
   - Actual usage (how many requests, what prompts) is hidden
   - Remaining balance is hidden (proven via ZK, not revealed)

3. **Mitigation Strategies**:
   - **Fresh Wallet Transfer**: Send ETH to fresh wallet → delegate from there
   - **Shielded Transfers (Aztec/Railgun)**: Use privacy layers on Ethereum
     ```
     User EOA → Aztec Connect → Shielded pool → Fresh EOA → ZK deposit
     // Breaks on-chain link between source and destination
     ```
   - **Batched Deposits**: Deposit same amount as 100 other users at same time (anonymity set)

**When to Use EIP-7702 Delegation**:
- ✅ You value **convenience** over maximum privacy
- ✅ You're okay with deposit being linked to your EOA (but not individual requests)
- ✅ You already have ETH in MetaMask and don't want new wallet
- ❌ You're a dissident/journalist needing maximum anonymity → use W3PK instead

**When to Use Fresh W3PK Wallet**:
- ✅ Maximum privacy (deposit not linked to any identity)
- ✅ You're using Stripe → buy ETH → fresh wallet has no history
- ✅ Critical use case (activism, whistleblowing, sensitive research)

### Comparison: W3PK vs EIP-7702 Delegation

| Feature | W3PK (Fresh Wallet) | EIP-7702 (Existing EOA) |
|---------|---------------------|-------------------------|
| **Setup Time** | ~2 min (passkey + deposit) | ~1 min (delegation signature) |
| **Deposit Privacy** | ⭐⭐⭐⭐⭐ (no link to identity) | ⭐⭐ (EOA visible on-chain) |
| **Request Privacy** | ⭐⭐⭐⭐⭐ (fully unlinkable) | ⭐⭐⭐⭐⭐ (fully unlinkable) |
| **Convenience** | ⭐⭐⭐⭐ (new wallet) | ⭐⭐⭐⭐⭐ (use existing) |
| **Gas Cost** | 1 deposit tx | 1 delegation tx |
| **Multi-Device** | ✅ (passkey sync) | ✅ (MetaMask sync) |
| **Best For** | Maximum privacy | Convenience |

## Future Enhancements

1. **Batch Processing**: Aggregate multiple requests in single proof
2. **Cross-Chain**: Support deposits from L2s (Arbitrum, Optimism) for lower fees
3. **Privacy Pools**: Mix deposits across users for enhanced anonymity
4. **Subscription Model**: Fixed monthly deposit for unlimited usage within rate limits
5. **Multi-Model Support**: Extend to other AI APIs (GPT-4, Gemini, etc.)
6. **Lattice-Based ZK**: Post-quantum secure proof system
7. **Automatic Stripe → Mixer → Deposit**: One-click privacy-preserving onboarding
8. **EIP-7702 Privacy Batching**: Coordinate deposit timing across users for larger anonymity sets

## References

### Core Protocol
- [ZK API Usage Credits (Ethresear.ch)](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) - Original proposal by Davide Crapis & Vitalik Buterin
- [Rate-Limit Nullifiers Documentation](https://rate-limiting-nullifier.github.io/rln-docs/rln.html) - Core cryptographic primitive

### APIs & Pricing
- [Claude API Pricing](https://www.anthropic.com/api) - Anthropic's official pricing
- [Kraken API Documentation](https://docs.kraken.com/api/) - ETH/USD exchange rate oracle

### Authentication & UX
- [W3PK - Passwordless Web3 Auth SDK](https://w3pk.w3hc.org/) - WebAuthn-based wallet authentication
- [W3PK GitHub Repository](https://github.com/w3hc/w3pk) - Open-source passkey SDK
- [EIP-7702: Set Code for EOAs](https://eips.ethereum.org/EIPS/eip-7702) - EOA delegation standard

### Comparisons
- [Venice AI](https://venice.ai/) - Privacy-focused AI service (comparison reference)
- [Venice AI Privacy Modes](https://venice.ai/privacy) - TEE and E2EE implementation details
