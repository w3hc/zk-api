# ZK API Reference

Complete API reference for the ZK API privacy-preserving system for accessing external API services.

**Reference Implementation**: This documentation uses Claude API as an example. The same patterns apply to any external API service integration.

## Base URL

```
https://localhost:3000  (development)
https://your-domain.com  (production)
```

**Development Note:** Use `-k` flag with curl to accept self-signed certificates in local development.

## Table of Contents

- [ZK API Reference](#zk-api-reference)
  - [Base URL](#base-url)
  - [Table of Contents](#table-of-contents)
  - [App Endpoints](#app-endpoints)
    - [POST /zk-api/request](#post-zk-apirequest)
    - [POST /zk-api/redeem-refund](#post-zk-apiredeem-refund)
    - [GET /zk-api/server-pubkey](#get-zk-apiserver-pubkey)
  - [Available for Future Implementation](#available-for-future-implementation)
  - [Health Check Endpoints](#health-check-endpoints)
    - [GET /health](#get-health)
    - [GET /health/ready](#get-healthready)
    - [GET /health/live](#get-healthlive)
  - [Error Responses](#error-responses)
  - [Protocol Flow](#protocol-flow)
    - [Complete Request Flow](#complete-request-flow)
  - [Client Implementation Guide](#client-implementation-guide)
    - [Prerequisites](#prerequisites)
    - [1. Generate Identity](#1-generate-identity)
    - [2. Deposit to Smart Contract](#2-deposit-to-smart-contract)
    - [3. Generate ZK Proof](#3-generate-zk-proof)
    - [4. Make API Request](#4-make-api-request)
    - [5. Redeem Refund Tickets](#5-redeem-refund-tickets)
  - [Cost Calculation](#cost-calculation)
    - [Claude API Pricing (March 2026)](#claude-api-pricing-march-2026)
    - [Example Calculations](#example-calculations)
  - [Security Best Practices](#security-best-practices)
  - [Support](#support)
  - [References](#references)
  - [License](#license)

---

## App Endpoints

### POST /zk-api/request

Submit anonymous external API request with Zero-Knowledge proof of solvency (example: Claude API).

**Authentication:** None (anonymity is provided by ZK proof)

**Request Body:**

```typescript
{
  payload: string;              // The message/prompt for external API
  proof: string;                // Groth16 ZK proof (JSON string)
  nullifier: string;            // Unique nullifier for this request
  signal: {
    x: string;                  // RLN signal x component
    y: string;                  // RLN signal y component
  };
  maxCost: string;              // Maximum cost willing to pay (in wei)
  model?: string;               // Example: claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5 (default: sonnet)
}
```

**Response:**

```typescript
{
  response: string;             // External API's response
  actualCost: string;           // Actual cost in wei
  refundTicket: {
    nullifier: string;          // Nullifier of this request
    value: string;              // Refund amount (maxCost - actualCost) in wei
    timestamp: number;          // Unix timestamp
    signature: {
      R8x: string;              // EdDSA signature component
      R8y: string;              // EdDSA signature component
      S: string;                // EdDSA signature component
    };
  };
  usage: {
    inputTokens: number;        // Tokens in request
    outputTokens: number;       // Tokens in response
  };
}
```

**Status Codes:**
- `200 OK` - Request processed successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Invalid ZK proof
- `403 Forbidden` - Nullifier already used or double-spend detected
- `500 Internal Server Error` - Server error

**Example:**

```bash
# Request
curl -k -X POST https://localhost:3000/zk-api/request \
  -H "Content-Type: application/json" \
  -d '{
    "payload": "What does 苟全性命於亂世，不求聞達於諸侯。mean?",
    "proof": "{\"pi_a\":[\"123...\",\"456...\"],\"pi_b\":[[\"789...\"]],\"pi_c\":[\"012...\"]}",
    "nullifier": "12345678901234567890123456789012",
    "signal": {
      "x": "98765432109876543210987654321098",
      "y": "11111111111111111111111111111111"
    },
    "maxCost": "1000000000000000",
    "model": "claude-sonnet-4.6"
  }'

# Response
{
  "response": "Quantum computing is a type of computation that harnesses quantum mechanical phenomena...",
  "actualCost": "750000000000000",
  "refundTicket": {
    "nullifier": "12345678901234567890123456789012",
    "value": "250000000000000",
    "timestamp": 1710857400,
    "signature": {
      "R8x": "0x1234...",
      "R8y": "0x5678...",
      "S": "0x9abc..."
    }
  },
  "usage": {
    "inputTokens": 50,
    "outputTokens": 300
  }
}
```

**Security Notes:**

1. **Unique Nullifiers**: Each nullifier can only be used once. Reusing a nullifier triggers:
   - Same message: Replay attack → Request rejected
   - Different message: Double-spend → Secret key extracted → RLN stake slashed

2. **ZK Proof Requirements**: The proof must demonstrate:
   - Identity commitment is in the Merkle tree (membership)
   - Sufficient balance for this request (solvency)
   - All previous refund tickets are valid (EdDSA signatures)
   - Correct RLN signal generation (nullifier = Hash(a), y = k + a*x)

3. **Cost Protection**: Set `maxCost` to protect against unexpected price changes

**See Also:** [ZK System Guide](ZK.md), [Testing Guide](TESTING_GUIDE.md)

---

### POST /zk-api/redeem-refund

Redeem a signed refund ticket on-chain.

**Authentication:** None (refund ticket signature authenticates)

**Request Body:**

```typescript
{
  idCommitment: string;         // User's identity commitment
  nullifier: string;            // Nullifier from the API request
  value: string;                // Refund amount in wei
  timestamp: number;            // Timestamp from refund ticket
  signature: {
    R8x: string;                // EdDSA signature components
    R8y: string;
    S: string;
  };
  recipient: string;            // Ethereum address to receive refund
}
```

**Response:**

```typescript
{
  success: boolean;
  transactionHash: string;      // Ethereum transaction hash
  message: string;              // Human-readable message
}
```

**Status Codes:**
- `200 OK` - Refund redeemed successfully
- `400 Bad Request` - Invalid refund ticket or signature
- `403 Forbidden` - Refund already redeemed or nullifier slashed
- `503 Service Unavailable` - Blockchain service not available

**Example:**

```bash
# Request
curl -k -X POST https://localhost:3000/zk-api/redeem-refund \
  -H "Content-Type: application/json" \
  -d '{
    "idCommitment": "0xabcd...",
    "nullifier": "12345678901234567890123456789012",
    "value": "250000000000000",
    "timestamp": 1710857400,
    "signature": {
      "R8x": "0x1234...",
      "R8y": "0x5678...",
      "S": "0x9abc..."
    },
    "recipient": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  }'

# Response
{
  "success": true,
  "transactionHash": "0xdef456...",
  "message": "Refund of 250000000000000 wei redeemed successfully"
}
```

**Important Notes:**

- Refund tickets can only be redeemed once
- The smart contract verifies the EdDSA signature on-chain
- If the nullifier was slashed for double-spending, redemption will fail
- Redemption requires on-chain gas fees (paid by caller)

---

### GET /zk-api/server-pubkey

Get the server's EdDSA public key for verifying refund ticket signatures.

**Authentication:** None

**Response:**

```typescript
{
  x: string;  // Public key x coordinate (hex)
  y: string;  // Public key y coordinate (hex)
}
```

**Example:**

```bash
# Request
curl -k https://localhost:3000/zk-api/server-pubkey

# Response
{
  "x": "0x1a2b3c4d...",
  "y": "0x9e8f7d6c..."
}
```

**Use Case:** Clients can verify refund ticket signatures off-chain before attempting to redeem on-chain.

---

## Available for Future Implementation

The following endpoints have been removed from the API but their underlying utilities remain in the codebase:

- **ML-KEM Encryption Endpoints** (`/secret/attestation`, `/secret/store`, `/secret/access`) - The `MlKemEncryptionService` is still available in `src/encryption/` for future implementation
- **Authentication Endpoint** (`POST /auth/nonce`) - The SIWE authentication service and guard are still available in `src/auth/` for future implementation

These can be re-enabled by creating new controllers that use the existing services.

---

## Health Check Endpoints

### GET /health

General health check endpoint.

**Response:**

```typescript
{
  status: 'ok';
  timestamp: string;  // ISO 8601 timestamp
}
```

---

### GET /health/ready

Readiness probe for orchestration systems (Kubernetes, etc.).

**Response:**

```typescript
{
  status: 'ready' | 'not ready';
  checks: {
    tee?: boolean;
    encryption?: boolean;
  };
}
```

**Status Codes:**
- `200 OK` - Service is ready
- `503 Service Unavailable` - Service is not ready

---

### GET /health/live

Liveness probe for orchestration systems.

**Response:**

```typescript
{
  status: 'alive';
}
```

**Status Codes:**
- `200 OK` - Service is alive
- `503 Service Unavailable` - Service should be restarted

---

## Error Responses

All endpoints return consistent error responses:

```typescript
{
  statusCode: number;
  message: string;
  error?: string;  // Error type (BadRequest, Unauthorized, Forbidden, etc.)
}
```

**Common Status Codes:**

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Invalid parameters, missing fields |
| 401 | Unauthorized | Invalid ZK proof |
| 403 | Forbidden | Nullifier reused, double-spend detected |
| 404 | Not Found | Resource does not exist |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Blockchain or external API unavailable |

**Example Error:**

```json
{
  "statusCode": 403,
  "message": "Double-spend detected. Your secret key has been extracted and you will be slashed.",
  "error": "Forbidden"
}
```

---

## Protocol Flow

### Complete Request Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1. Generate secret key (once)
       ▼
   secretKey = random()
   idCommitment = Hash(secretKey)
       │
       │ 2. Deposit to smart contract
       ▼
   zkApiCredits.deposit(idCommitment, { value: 0.01 ETH })
       │
       │ 3. For each request:
       ▼
   Generate ZK proof:
     - Merkle proof of membership
     - Sum of previous refunds
     - Solvency: (ticketIndex + 1) × maxCost ≤ deposit + refunds
       │
       │ 4. Compute RLN signal
       ▼
   a = Hash(secretKey, ticketIndex)
   nullifier = Hash(a)
   x = Hash(payload)
   y = secretKey + a × x
       │
       │ 5. Submit request
       ▼
   POST /zk-api/request
   {
     payload: "What does 苟全性命於亂世，不求聞達於諸侯。mean?",
     proof: {...},
     nullifier: nullifier,
     signal: { x, y },
     maxCost: "1000000000000000"
   }
       │
       ▼
┌──────────────────────────────┐
│      Server Verification     │
├──────────────────────────────┤
│ 1. Check nullifier reuse     │
│ 2. Verify ZK proof           │
│ 3. Execute Claude API call   │
│ 4. Calculate actual cost     │
│ 5. Sign refund ticket        │
└──────┬───────────────────────┘
       │
       │ 6. Return response + refund ticket
       ▼
   {
     response: "...",
     actualCost: "750000000000000",
     refundTicket: { signature: {...} }
   }
       │
       │ 7. Store refund ticket
       ▼
   refundTickets.push(refundTicket)
   ticketIndex++
       │
       │ 8. After multiple requests, redeem refunds
       ▼
   POST /zk-api/redeem-refund
   { nullifier, value, signature, recipient }
       │
       ▼
   Smart contract verifies signature
   → Transfers refund to recipient
```

---

## Client Implementation Guide

### Prerequisites

```bash
npm install circomlibjs snarkjs ethers
```

### 1. Generate Identity

```typescript
import { buildPoseidon } from 'circomlibjs';
import { randomBytes } from 'crypto';

// Generate secret key (store securely!)
const secretKey = BigInt('0x' + randomBytes(32).toString('hex'));

// Create identity commitment
const poseidon = await buildPoseidon();
const idCommitment = poseidon([secretKey]);

console.log('Secret Key:', secretKey.toString(16));
console.log('ID Commitment:', poseidon.F.toString(idCommitment, 16));
```

### 2. Deposit to Smart Contract

```typescript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_KEY');
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const zkApiCredits = new ethers.Contract(
  ZK_API_CREDITS_ADDRESS,
  ZK_API_CREDITS_ABI,
  wallet
);

const tx = await zkApiCredits.deposit(idCommitment, {
  value: ethers.parseEther('0.01')
});

await tx.wait();
console.log('Deposit successful!');
```

### 3. Generate ZK Proof

```typescript
import { groth16 } from 'snarkjs';

async function generateProof(
  secretKey: bigint,
  merkleProof: any,
  refundTickets: any[],
  ticketIndex: number,
  maxCost: bigint,
  payload: string
) {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Compute RLN values
  const a = poseidon([secretKey, ticketIndex]);
  const nullifier = poseidon([a]);
  const x = poseidon([payload]);
  const y = F.add(secretKey, F.mul(a, x));

  // Circuit inputs
  const inputs = {
    secretKey: secretKey.toString(),
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,
    refundValues: refundTickets.map(t => t.value),
    refundSignatures: refundTickets.map(t => [t.signature.R8x, t.signature.R8y, t.signature.S]),
    ticketIndex: ticketIndex,
    merkleRoot: merkleProof.root,
    maxCost: maxCost.toString(),
    initialDeposit: INITIAL_DEPOSIT.toString(),
    signalX: F.toString(x),
    serverPubKeyX: SERVER_PUBKEY_X,
    serverPubKeyY: SERVER_PUBKEY_Y
  };

  // Generate proof
  const { proof, publicSignals } = await groth16.fullProve(
    inputs,
    'circuits/api_credit_proof.wasm',
    'circuits/api_credit_proof.zkey'
  );

  return {
    proof: JSON.stringify(proof),
    nullifier: F.toString(nullifier),
    signal: {
      x: F.toString(x),
      y: F.toString(y)
    }
  };
}
```

### 4. Make API Request

```typescript
const { proof, nullifier, signal } = await generateProof(
  secretKey,
  merkleProof,
  refundTickets,
  ticketIndex,
  ethers.parseEther('0.001'),
  'What does 苟全性命於亂世，不求聞達於諸侯。mean?'
);

const response = await fetch('https://api.zkapi.example/zk-api/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    payload: 'What does 苟全性命於亂世，不求聞達於諸侯。mean?',
    proof,
    nullifier,
    signal,
    maxCost: ethers.parseEther('0.001').toString(),
    model: 'claude-sonnet-4.6'
  })
});

const result = await response.json();
console.log('Response:', result.response);
console.log('Cost:', ethers.formatEther(result.actualCost), 'ETH');

// Store refund ticket for next request
refundTickets.push(result.refundTicket);
ticketIndex++;
```

### 5. Redeem Refund Tickets

```typescript
// Redeem accumulated refunds
for (const ticket of refundTickets) {
  const response = await fetch('https://api.zkapi.example/zk-api/redeem-refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idCommitment: idCommitment.toString(),
      nullifier: ticket.nullifier,
      value: ticket.value,
      timestamp: ticket.timestamp,
      signature: ticket.signature,
      recipient: YOUR_ETHEREUM_ADDRESS
    })
  });

  const result = await response.json();
  console.log('Refund redeemed:', result.transactionHash);
}
```

---

## Cost Calculation

### Claude API Pricing (March 2026)

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|-------------------|---------------------|
| claude-opus-4.6 | $5 | $25 |
| claude-sonnet-4.6 | $3 | $15 |
| claude-haiku-4.5 | $1 | $5 |

### Example Calculations

Assuming ETH = $2,000:

**Simple Q&A (Opus 4.6)**
- Input: 100 tokens = 100/1M × $5 = $0.0005
- Output: 400 tokens = 400/1M × $25 = $0.01
- Total: $0.0105 = 0.00000525 ETH = 5,250,000,000,000 wei

**Code Generation (Sonnet 4.6)**
- Input: 500 tokens = 500/1M × $3 = $0.0015
- Output: 2000 tokens = 2000/1M × $15 = $0.03
- Total: $0.0315 = 0.00001575 ETH = 15,750,000,000,000 wei

---

## Security Best Practices

1. **Protect Your Secret Key**
   - Store in secure key management system
   - Never transmit over network
   - Never log or print
   - Use hardware security module (HSM) for production

2. **Never Reuse Nullifiers**
   - Track `ticketIndex` carefully
   - Increment after each request
   - Store state persistently

3. **Verify Refund Signatures**
   - Check server's EdDSA signature before redeeming
   - Compare against server public key

4. **Set Reasonable Max Cost**
   - Estimate token usage
   - Add safety margin (20-50%)
   - Refunds are automatic

5. **Monitor Double-Spend Attempts**
   - If secret key is compromised, withdraw immediately
   - Watch for suspicious nullifier patterns

---

## Support

- **Documentation:** [docs/](.)
- **ZK System Guide:** [ZK.md](ZK.md)
- **Testing Guide:** [TESTING_GUIDE.md](TESTING_GUIDE.md)
- **Smart Contract:** [contracts/src/ZkApiCredits.sol](../contracts/src/ZkApiCredits.sol)
- **Issues:** GitHub repository

---

## References

- [ZK API Usage Credits Proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) - Davide Crapis & Vitalik Buterin
- [Rate-Limit Nullifiers Documentation](https://rate-limiting-nullifier.github.io/rln-docs/)
- [Circom Documentation](https://docs.circom.io/)
- [SnarkJS](https://github.com/iden3/snarkjs)
- [Anthropic API Pricing](https://www.anthropic.com/api)

---

## License

GPL-3.0
