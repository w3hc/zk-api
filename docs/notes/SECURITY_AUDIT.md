# Comprehensive Security Audit Report: ZK API

**Audit Date:** 2026-03-23
**Auditor:** Security Analysis Team
**Version:** 0.1.0
**Status:** NOT PRODUCTION-READY

---

## Executive Summary

This security audit examined a privacy-preserving API system that combines Zero-Knowledge proofs (Groth16), Rate-Limit Nullifiers (RLN), ML-KEM post-quantum encryption, TEE attestation, and blockchain integration. The system enables anonymous access to Claude AI models through a prepaid credit system.

**Overall Risk Assessment: MEDIUM-HIGH**

The codebase demonstrates solid architectural design with good security awareness, but contains **9 Critical (P0)**, **12 High (P1)**, **15 Medium (P2)**, and **8 Low (P3)** severity issues that must be addressed before production deployment.

### Key Findings

- ❌ **Multiple critical cryptographic implementation issues** (placeholder EdDSA, simplified refund signing)
- ❌ **In-memory state storage** creates data loss and double-spend vulnerabilities
- ❌ **Missing input validation** and sanitization in critical paths
- ❌ **Smart contract hash function mismatch** (keccak256 vs Poseidon incompatibility)
- ❌ **Incomplete ZK proof verification** (only structural validation)
- ❌ **Secrets management vulnerabilities** (environment variables)
- ❌ **Missing rate limiting** and DoS protections

---

## Table of Contents

1. [Critical Vulnerabilities (P0)](#1-critical-vulnerabilities-p0)
2. [High Severity Issues (P1)](#2-high-severity-issues-p1)
3. [Medium Severity Issues (P2)](#3-medium-severity-issues-p2)
4. [Low Severity Issues (P3)](#4-low-severity-issues-p3)
5. [Security Best Practice Recommendations](#5-security-best-practice-recommendations)
6. [Positive Security Observations](#6-positive-security-observations)
7. [Compliance & Regulatory Considerations](#7-compliance--regulatory-considerations)
8. [Conclusion & Roadmap](#8-conclusion--roadmap)

---

## 1. Critical Vulnerabilities (P0)

### P0-1: Placeholder EdDSA Implementation Accepts Invalid Signatures

**Severity:** 🔴 Critical
**Location:** [refund-signer.service.ts:105-138](src/zk-api/refund-signer.service.ts#L105)

**Description:**
The `RefundSignerService` uses a simplified EdDSA implementation based on SHA256 hashing instead of proper EdDSA (Ed25519) signatures. The signing is deterministic but not cryptographically secure.

**Vulnerable Code:**
```typescript
private sign(message: string): {
  R8x: string;
  R8y: string;
  S: string;
} {
  // Simplified EdDSA signing for development
  // In production, use @noble/curves or circomlibjs
  const hash1 = createHash('sha256');
  hash1.update(message + this.privateKey + 'R8x');
  const R8x = '0x' + hash1.digest('hex');
  // ...
}
```

**Impact:**
- Refund tickets can be forged by anyone who understands the deterministic scheme
- The signing scheme is not compatible with EdDSA verification in ZK circuits
- No mathematical relationship between private/public keys and signatures
- **Economic loss:** Users can forge unlimited refund tickets

**Proof of Concept:**
```typescript
// Attacker can generate valid-looking signatures without the private key
const fakeSignature = {
  R8x: '0x' + createHash('sha256').update(message + 'guess' + 'R8x').digest('hex'),
  R8y: '0x' + createHash('sha256').update(message + 'guess' + 'R8y').digest('hex'),
  S: '0x' + createHash('sha256').update(message + 'guess' + 'S').digest('hex')
};
```

**Remediation:**

1. Implement proper EdDSA using `@noble/curves` or `circomlibjs`
2. Use Babyjubjub curve compatible with ZK circuits
3. Generate proper EdDSA keypairs with the eddsa library
4. Ensure signature verification works both on-chain and in circuits

**Example Fix:**
```typescript
import { buildEddsa } from 'circomlibjs';

async sign(message: string) {
  const eddsa = await buildEddsa();
  const msgHash = this.poseidon([message]);
  const signature = eddsa.signPoseidon(this.privateKey, msgHash);
  return {
    R8x: signature.R8[0].toString(16),
    R8y: signature.R8[1].toString(16),
    S: signature.S.toString(16)
  };
}
```

---

### P0-2: Smart Contract Signature Verification Always Returns True

**Severity:** 🔴 Critical
**Location:** [ZkApiCredits.sol:405-427](contracts/src/ZkApiCredits.sol#L405)

**Description:**
The smart contract's `_verifyEdDSASignature` function only validates that signature components are non-zero, but does not perform actual cryptographic verification.

**Vulnerable Code:**
```solidity
function _verifyEdDSASignature(
    bytes32 _message,
    EdDSASignature calldata _signature
) internal view returns (bool) {
    if (_message == bytes32(0)) return false;
    if (_signature.R8x == bytes32(0)) return false;
    if (_signature.R8y == bytes32(0)) return false;
    if (_signature.S == bytes32(0)) return false;

    return true; // Placeholder - accepts all non-zero signatures
}
```

**Impact:**
- Anyone can redeem arbitrary refunds with fake signatures
- Complete bypass of refund authentication
- Users can drain contract funds
- **Financial loss:** All contract funds at risk

**Attack Scenario:**
```solidity
// Attacker submits fake signature with any non-zero values
EdDSASignature memory fakeSignature = EdDSASignature({
    R8x: bytes32(uint256(1)),
    R8y: bytes32(uint256(2)),
    S: bytes32(uint256(3))
});
// This will pass verification and allow redemption!
```

**Remediation:**

1. Implement proper EdDSA verification in Solidity
2. Use a verified library like `@zk-kit/eddsa-poseidon` or circom-based verification
3. Verify equation: `s*B = R + H(R,A,M)*A`
4. Consider using ZK-SNARK to verify refund signatures off-chain

**Example Fix:**
```solidity
// Use proper EdDSA verification (Babyjubjub curve)
function _verifyEdDSASignature(
    bytes32 _message,
    EdDSASignature calldata _signature,
    bytes32[2] calldata _publicKey
) internal view returns (bool) {
    // Import and use circom EdDSA verifier contract
    return eddsaVerifier.verify(
        _message,
        _signature.R8x,
        _signature.R8y,
        _signature.S,
        _publicKey
    );
}
```

---

### P0-3: In-Memory Nullifier Store Loses Data on Restart

**Severity:** 🔴 Critical
**Location:** [nullifier-store.service.ts:24-26](src/zk-api/nullifier-store.service.ts#L24)

**Description:**
Nullifiers are stored in memory (`Map`) and lost on server restart, allowing double-spend attacks.

**Vulnerable Code:**
```typescript
@Injectable()
export class NullifierStoreService {
  private readonly store = new Map<string, StoredSignal>();
  private readonly redeemedRefunds = new Map<string, RefundRedemption>();
  // ...
}
```

**Impact:**
- After server restart, all nullifiers are forgotten
- Users can reuse nullifiers to make unlimited free API requests
- Double-spend detection fails completely
- **Economic loss:** Unlimited free API usage

**Attack Scenario:**
1. User makes request with nullifier `N1`
2. Server restarts (crash, deployment, etc.)
3. User submits same nullifier `N1` again
4. Server accepts it as new (no record exists)
5. Repeat indefinitely for free API access

**Remediation:**

1. Migrate to Redis with persistence enabled
2. Or use PostgreSQL with indexed nullifier table
3. Implement write-through caching
4. Add startup validation to sync with on-chain state

**Example Fix:**
```typescript
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class NullifierStoreService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async get(nullifier: string): Promise<StoredSignal | null> {
    const data = await this.redis.get(`nullifier:${nullifier}`);
    return data ? JSON.parse(data) : null;
  }

  async set(nullifier: string, signal: StoredSignal): Promise<void> {
    await this.redis.set(
      `nullifier:${nullifier}`,
      JSON.stringify(signal),
      'EX',
      86400 * 365 // 1 year TTL
    );
  }
}
```

---

### P0-4: ZK Proof Verification Only Checks Structure, Not Validity

**Severity:** 🔴 Critical
**Location:** [proof-verifier.service.ts:25-59](src/zk-api/proof-verifier.service.ts#L25)

**Description:**
The proof verifier only validates JSON structure but doesn't verify the actual cryptographic proof.

**Vulnerable Code:**
```typescript
verify(proof: string): boolean {
  // Parse proof
  const proofData = JSON.parse(proof);

  // Basic structure validation
  if (proofData.protocol !== 'groth16') {
    return false;
  }

  if (!proofData.pi_a || !proofData.pi_b || !proofData.pi_c) {
    return false;
  }

  this.logger.debug('Proof structure validated');
  return true; // Does NOT verify cryptographic validity
}
```

**Impact:**
- Anyone can submit fake proofs with valid structure
- No actual verification of solvency, membership, or refund validity
- Complete bypass of ZK proof security
- **Privacy loss:** Anonymity set compromised

**Attack Scenario:**
```typescript
// Attacker creates fake proof with valid structure
const fakeProof = JSON.stringify({
  protocol: 'groth16',
  pi_a: ['0', '0', '1'],
  pi_b: [['0', '0'], ['0', '0'], ['0', '1']],
  pi_c: ['0', '0', '1'],
  publicSignals: ['fake_nullifier', 'fake_root']
});
// This will be accepted as valid!
```

**Remediation:**

1. Use snarkjs `groth16.verify` with actual verification key
2. Load verification key from trusted setup
3. Verify public signals match expected values
4. Consider on-chain verification for additional security

**Example Fix:**
```typescript
import { groth16 } from 'snarkjs';
import * as fs from 'fs/promises';

async verify(proof: string, publicSignals: string[]): Promise<boolean> {
  const vkey = JSON.parse(
    await fs.readFile('./circuits/verification_key.json', 'utf-8')
  );
  const proofData = JSON.parse(proof);

  const isValid = await groth16.verify(vkey, publicSignals, proofData);

  if (!isValid) {
    this.logger.warn('Cryptographic proof verification failed');
    return false;
  }

  // Additional validation of public signals
  this.validatePublicSignals(publicSignals);

  return true;
}
```

---

### P0-5: Smart Contract Hash Function Mismatch with Circuit

**Severity:** 🔴 Critical
**Location:** [ZkApiCredits.sol:175-176](contracts/src/ZkApiCredits.sol#L175)

**Description:**
The contract uses Keccak256 for identity commitment verification, but the circuit uses Poseidon hash.

**Vulnerable Code (Contract):**
```solidity
// Verify ownership: Hash(secretKey) should equal idCommitment
if (keccak256(abi.encodePacked(_secretKey)) != _idCommitment)
    revert InvalidSecretKey();
```

**Circuit Code:**
```circom
// 1. Compute identity commitment: ID = Hash(secretKey)
component idHash = Poseidon(1);
idHash.inputs[0] <== secretKey;
idCommitment <== idHash.out;
```

**Impact:**
- Withdrawal verification will always fail
- Users cannot withdraw their deposits
- Hash functions are incompatible between circuit and contract
- **Fund lock:** All deposits become permanently locked

**Proof of Concept:**
```typescript
// User deposits with: idCommitment = Poseidon(secretKey)
const secretKey = 12345n;
const idCommitment = poseidon([secretKey]); // e.g., 0xabc...

// Later tries to withdraw:
// Contract checks: keccak256(secretKey) == idCommitment
// keccak256(12345) != 0xabc... → ALWAYS FAILS
```

**Remediation:**

1. Implement Poseidon hash in Solidity
2. Use a verified Poseidon implementation (e.g., from circomlibjs or compatible library)
3. Or remove secret key verification on-chain (ZK proof already proves ownership)

**Example Fix (Option 1 - Add Poseidon):**
```solidity
import {PoseidonT2} from "./Poseidon.sol"; // circom-generated

function _verifyIdCommitment(
    uint256 _secretKey,
    bytes32 _idCommitment
) internal view returns (bool) {
    uint256 computedCommitment = PoseidonT2.hash([_secretKey]);
    return bytes32(computedCommitment) == _idCommitment;
}
```

**Example Fix (Option 2 - Trust ZK Proof):**
```solidity
// Remove on-chain secret verification entirely
// The ZK proof already proves the user knows the secret
function withdraw(
    bytes32 _idCommitment,
    bytes calldata _proof
) external {
    // Verify ZK proof instead of revealing secret
    require(verifyWithdrawalProof(_proof, _idCommitment), "Invalid proof");
    // ... proceed with withdrawal
}
```

---

### P0-6: Merkle Root Update Uses Wrong Hash Function

**Severity:** 🔴 Critical
**Location:** [ZkApiCredits.sol:371-376](contracts/src/ZkApiCredits.sol#L371)

**Description:**
The contract updates Merkle root using Keccak256 of all commitments, not a proper Poseidon-based Merkle tree.

**Vulnerable Code:**
```solidity
function _updateMerkleRoot() internal {
    // Simple hash of all commitments (not a real Merkle tree)
    // In production, use proper Merkle tree library
    merkleRoot = keccak256(abi.encodePacked(identityCommitments));
    emit MerkleRootUpdated(merkleRoot, identityCommitments.length);
}
```

**Impact:**
- Merkle root incompatible with circuit expectations
- Proofs generated off-chain will fail on-chain verification
- Complete system failure when contract verification is enabled
- **System breakdown:** No user can generate valid proofs

**Attack Surface:**
```typescript
// Off-chain: Merkle tree built with Poseidon
const tree = new IncrementalMerkleTree(poseidon, 20, 0n, 2);
tree.insert(commitment1);
tree.insert(commitment2);
const root = tree.root; // Poseidon-based

// On-chain: Merkle root computed with Keccak256
merkleRoot = keccak256([commitment1, commitment2]); // Different!

// User generates proof with Poseidon-based tree
// Contract expects Keccak256-based tree
// → Proof verification fails
```

**Remediation:**

1. Implement incremental Poseidon-based Merkle tree in Solidity
2. Use a library like `@zk-kit/incremental-merkle-tree` for Solidity
3. Maintain same tree structure as off-chain tree
4. Gas optimization: Only store root, verify membership through ZK proof

**Example Fix:**
```solidity
import {IncrementalBinaryTree, IncrementalTreeData} from "@zk-kit/incremental-merkle-tree.sol/IncrementalBinaryTree.sol";
import {PoseidonT3} from "./Poseidon.sol";

using IncrementalBinaryTree for IncrementalTreeData;

IncrementalTreeData internal merkleTree;

constructor() {
    merkleTree.init(20, 0); // depth=20, zero=0
}

function deposit(...) external payable {
    // ...
    merkleTree.insert(PoseidonT3.hash, _idCommitment);
    emit MerkleRootUpdated(merkleTree.root, merkleTree.numberOfLeaves);
}
```

---

### P0-7: Private Keys Stored in Environment Variables

**Severity:** 🔴 Critical
**Location:**
- [refund-signer.service.ts:18-19](src/zk-api/refund-signer.service.ts#L18)
- [mlkem-encryption.service.ts:69-71](src/encryption/mlkem-encryption.service.ts#L69)

**Description:**
Critical private keys (EdDSA signing key, ML-KEM decryption key) are loaded from environment variables.

**Vulnerable Code:**
```typescript
// RefundSignerService
this.privateKey = process.env.OPERATOR_PRIVATE_KEY || this.generatePrivateKey();

// MlkemEncryptionService
const privateKeyBase64 = this.configService.get<string>('ADMIN_MLKEM_PRIVATE_KEY');
this.privateKey = Buffer.from(privateKeyBase64, 'base64');
```

**Impact:**
- Keys exposed in process memory, logs, crash dumps
- Keys visible to anyone with server access
- No hardware security module (HSM) protection
- Keys can be exfiltrated through various attack vectors
- **System compromise:** Complete loss of confidentiality

**Attack Vectors:**
1. `/proc/[pid]/environ` - Environment variables readable
2. Core dumps contain environment
3. Container logs may leak environment
4. CI/CD logs often expose environment
5. Error reporting services (Sentry, etc.) may capture environment

**Remediation:**

1. Use AWS KMS, Google Cloud KMS, or Azure Key Vault
2. Or use hardware security module (HSM)
3. Load keys only in TEE with remote attestation
4. Never log or expose keys in any form
5. Rotate keys regularly

**Example Fix (AWS KMS):**
```typescript
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';

@Injectable()
export class RefundSignerService {
  private privateKey: Buffer;
  private readonly kms: KMSClient;

  constructor() {
    this.kms = new KMSClient({ region: 'us-east-1' });
  }

  async onModuleInit() {
    const encryptedKeyBlob = process.env.ENCRYPTED_OPERATOR_KEY;

    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(encryptedKeyBlob, 'base64'),
      KeyId: process.env.KMS_KEY_ID
    });

    const result = await this.kms.send(command);
    this.privateKey = result.Plaintext;
  }
}
```

**Example Fix (TEE with Attestation):**
```typescript
async loadKeyFromTee(): Promise<Buffer> {
  // Only load key if running in valid TEE
  const attestation = await this.teePlatform.generateAttestation();

  if (!attestation.valid) {
    throw new Error('Not running in valid TEE');
  }

  // Retrieve key from sealed storage
  return this.teePlatform.unsealSecret('operator_key');
}
```

---

### P0-8: Secret Key Extraction Math Uses Integer Division

**Severity:** 🔴 Critical
**Location:** [zk-api.service.ts:125-144](src/zk-api/zk-api.service.ts#L125)

**Description:**
The secret key extraction from double-spend uses regular integer division instead of field arithmetic.

**Vulnerable Code:**
```typescript
private extractSecretKey(
  signal1: { x: string; y: string },
  signal2: { x: string; y: string },
): string {
  const x1 = BigInt(signal1.x);
  const y1 = BigInt(signal1.y);
  const x2 = BigInt(signal2.x);
  const y2 = BigInt(signal2.y);

  const numerator = y1 * x2 - y2 * x1;
  const denominator = x2 - x1;
  const k = numerator / denominator; // Regular division, not modular!

  return '0x' + k.toString(16).padStart(64, '0');
}
```

**Impact:**
- Incorrect secret key extraction
- False slashing of innocent users
- Mathematical incompatibility with field arithmetic
- **User funds loss:** Innocent users get slashed

**Mathematical Error:**

In Rate-Limit Nullifiers, the signal is computed in a finite field:
```
y = a * x + k (mod p)
```

To extract `k` from two signals:
```
k = (y1*x2 - y2*x1) / (x2 - x1) (mod p)
```

The division must be performed using **modular inverse**, not regular division.

**Attack Scenario:**
```typescript
// Two signals from same user:
// y1 = a*x1 + k (mod p)
// y2 = a*x2 + k (mod p)

// Correct extraction (field arithmetic):
// k = (y1*x2 - y2*x1) * (x2-x1)^-1 (mod p)

// Incorrect extraction (current code):
// k = (y1*x2 - y2*x1) / (x2-x1)  (integer division)

// These produce different results!
```

**Remediation:**

Use field arithmetic with modular inverse:

```typescript
import { buildPoseidon } from 'circomlibjs';

async extractSecretKey(
  signal1: { x: string; y: string },
  signal2: { x: string; y: string }
): Promise<bigint> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F; // Finite field

  const x1 = F.e(signal1.x);
  const y1 = F.e(signal1.y);
  const x2 = F.e(signal2.x);
  const y2 = F.e(signal2.y);

  // Compute numerator: y1*x2 - y2*x1
  const numerator = F.sub(
    F.mul(y1, x2),
    F.mul(y2, x1)
  );

  // Compute denominator: x2 - x1
  const denominator = F.sub(x2, x1);

  // Divide using modular inverse
  const k = F.div(numerator, denominator);

  return F.toObject(k);
}
```

---

### P0-9: No Signature Verification for Refunds in Backend

**Severity:** 🔴 Critical
**Location:** [zk-api.service.ts:101-106](src/zk-api/zk-api.service.ts#L101)

**Description:**
The backend generates and returns refund tickets but never verifies them before accepting in future requests.

**Vulnerable Code:**
```typescript
const refundTicket = this.refundSigner.signRefund({
  nullifier: req.nullifier,
  value: refundValue.toString(),
  timestamp: Date.now(),
});
// Ticket returned to client, but never verified later
```

**Impact:**
- Users can forge refund tickets for inflated values
- No validation when tickets are presented in ZK proofs
- Economic loss for the service operator
- **Economic attack:** Unlimited free credits

**Attack Scenario:**
1. User receives legitimate refund: `{value: 100, signature: S1}`
2. User modifies refund: `{value: 10000, signature: S1}` (wrong signature)
3. User generates ZK proof including modified refund
4. Backend accepts proof without verifying refund signature
5. User gets 100x more credits than entitled

**Remediation:**

1. Verify refund ticket signatures in `ProofVerifierService`
2. Check signature against server public key
3. Validate value, timestamp, and nullifier match
4. Store issued refunds in database for double-check

**Example Fix:**
```typescript
// In ProofVerifierService
async verifyRefundTickets(
  refunds: RefundTicket[],
  proof: string
): Promise<boolean> {
  for (const refund of refunds) {
    // Verify signature
    const isValidSig = await this.refundSigner.verifySignature(
      refund.message,
      refund.signature
    );

    if (!isValidSig) {
      this.logger.warn('Invalid refund signature', { refund });
      return false;
    }

    // Check refund hasn't been redeemed
    if (await this.nullifierStore.isRefundRedeemed(refund.nullifier)) {
      this.logger.warn('Refund already redeemed', { refund });
      return false;
    }

    // Validate timestamp (not too old)
    const age = Date.now() - refund.timestamp;
    if (age > 7 * 24 * 60 * 60 * 1000) { // 7 days
      this.logger.warn('Refund expired', { refund });
      return false;
    }
  }

  return true;
}
```

---

## 2. High Severity Issues (P1)

### P1-1: ETH Rate Oracle Has No Fallback or Validation

**Severity:** 🟠 High
**Location:** [eth-rate-oracle.service.ts:24-71](src/zk-api/eth-rate-oracle.service.ts#L24)

**Description:**
The oracle fetches ETH/USD from Kraken API but has minimal validation and stale cache fallback.

**Vulnerable Code:**
```typescript
if (!response.ok) {
  throw new Error(`Kraken API returned ${response.status}`);
}

const data = (await response.json()) as KrakenTickerResponse;
const rate = parseFloat(data.result.XETHZUSD.c[0]);

if (isNaN(rate) || rate <= 0) {
  throw new Error(`Invalid ETH/USD rate received: ${rate}`);
}
```

**Impact:**
- Price manipulation through Kraken API compromise
- Stale prices used during outages (up to infinity if cache exists)
- No sanity checks on price changes (e.g., >10% swing)
- **Economic loss:** Mispriced credits

**Remediation:**

1. Use multiple oracle sources (Chainlink, Uniswap TWAP, CoinGecko)
2. Implement median of 3+ sources
3. Add price change limits (reject if >10% from last price)
4. Add circuit breaker for extreme volatility
5. Set maximum cache age (e.g., 5 minutes)

**Example Fix:**
```typescript
async getEthUsdRate(): Promise<number> {
  const sources = await Promise.allSettled([
    this.fetchKraken(),
    this.fetchChainlink(),
    this.fetchCoinGecko()
  ]);

  const prices = sources
    .filter(s => s.status === 'fulfilled')
    .map(s => s.value);

  if (prices.length < 2) {
    throw new Error('Insufficient price sources');
  }

  // Use median to resist outliers
  const median = this.calculateMedian(prices);

  // Validate against last price
  if (this.lastPrice && Math.abs(median - this.lastPrice) / this.lastPrice > 0.1) {
    throw new Error('Price change exceeds 10% threshold');
  }

  this.lastPrice = median;
  return median;
}
```

---

### P1-2: Missing Server Public Key Validation in Circuits

**Severity:** 🟠 High
**Location:** [api_credit_proof.circom:70-71](circuits/api_credit_proof.circom#L70)

**Description:**
The circuit accepts server public key as input but doesn't validate it matches expected value.

**Vulnerable Code:**
```circom
signal input serverPubKeyX;
signal input serverPubKeyY;

// No validation that these match expected server key!
```

**Impact:**
- User could provide fake server public key
- Bypass refund signature verification
- Forge refund tickets
- **System bypass:** Proof system defeated

**Attack Scenario:**
1. Attacker generates own EdDSA keypair
2. Creates fake refund with own signature
3. Submits proof with own public key as `serverPubKey`
4. Circuit verifies signature against attacker's key → passes!

**Remediation:**

Make server public key a constant in the circuit:

```circom
// Define server public key as constants (hardcoded)
// These should match the actual server's public key
template ApiCreditProof(levels, maxRefunds) {
    // Constants from trusted setup
    var SERVER_PUBKEY_X = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    var SERVER_PUBKEY_Y = 10944121435919637611123202872628637544348155578648911831344518947322613104291;

    // Verify refund signatures against constant public key
    component refundVerifier = EdDSAVerifier();
    refundVerifier.Ax <== SERVER_PUBKEY_X;
    refundVerifier.Ay <== SERVER_PUBKEY_Y;
    // ...
}
```

---

### P1-3: No Merkle Tree Depth Validation

**Severity:** 🟠 High
**Location:** [merkle-tree.service.ts:23](src/zk-api/merkle-tree.service.ts#L23)

**Description:**
Fixed depth of 20 in code, but circuit might have different depth.

**Vulnerable Code:**
```typescript
// Service
private readonly TREE_DEPTH = 20;

// Circuit
component main {public [...]} = ApiCreditProof(20, 100);
```

**Impact:**
- Proof generation with wrong depth fails silently
- Mismatch between off-chain tree and circuit expectations
- **User experience:** Proofs fail without clear error

**Remediation:**

1. Load depth from configuration shared between circuit and service
2. Validate depth matches on startup
3. Reject proofs with mismatched depth

**Example Fix:**
```typescript
// config/circuit.config.ts
export const CIRCUIT_CONFIG = {
  merkleDepth: 20,
  maxRefunds: 100
} as const;

// merkle-tree.service.ts
import { CIRCUIT_CONFIG } from '../config/circuit.config';

@Injectable()
export class MerkleTreeService {
  private readonly TREE_DEPTH = CIRCUIT_CONFIG.merkleDepth;

  async onModuleInit() {
    // Validate circuit matches
    const circuitInfo = await this.loadCircuitInfo();
    if (circuitInfo.depth !== this.TREE_DEPTH) {
      throw new Error(
        `Circuit depth mismatch: expected ${this.TREE_DEPTH}, got ${circuitInfo.depth}`
      );
    }
  }
}
```

---

### P1-4: Chest Secret Storage Has No Access Control Beyond SIWE

**Severity:** 🟠 High
**Location:** [secret.service.ts:129-174](src/secret/secret.service.ts#L129)

**Description:**
Once authenticated with SIWE, any owner can access secrets unlimited times with no rate limiting.

**Impact:**
- DoS through repeated access requests
- No audit trail of access
- No protection against compromised owner address
- **Privacy loss:** Excessive secret access

**Remediation:**

1. Add rate limiting per address
2. Log all access attempts with IP addresses
3. Implement one-time access tokens
4. Add expiration to secrets

**Example Fix:**
```typescript
@Injectable()
export class SecretService {
  private readonly accessLog = new Map<string, AccessAttempt[]>();

  async access(secretId: string, owner: string): Promise<DecryptedSecret> {
    // Rate limiting
    const recentAccess = this.getRecentAccess(owner);
    if (recentAccess.length > 10) {
      throw new TooManyRequestsException('Rate limit exceeded');
    }

    // Audit logging
    this.logger.log('Secret access', {
      secretId,
      owner,
      timestamp: Date.now(),
      ip: this.request.ip
    });

    // Check expiration
    const secret = await this.getSecret(secretId);
    if (secret.expiresAt && Date.now() > secret.expiresAt) {
      throw new NotFoundException('Secret expired');
    }

    // Decrement access count
    if (secret.maxAccess !== undefined) {
      secret.maxAccess--;
      if (secret.maxAccess <= 0) {
        await this.deleteSecret(secretId);
      }
    }

    return this.decrypt(secret);
  }
}
```

---

### P1-5: No Validation of Refund Ticket Timestamp

**Severity:** 🟠 High
**Location:** [ZkApiCredits.sol:276-307](contracts/src/ZkApiCredits.sol#L276)

**Description:**
Refund redemption doesn't validate timestamp is recent.

**Impact:**
- Old refund tickets can be redeemed years later
- Replay attacks with old signatures
- No expiration mechanism
- **Economic loss:** Stale refunds redeemed

**Remediation:**

```solidity
function redeemRefund(
    bytes32 _nullifier,
    uint256 _refundValue,
    uint256 _timestamp,
    address _recipient,
    EdDSASignature calldata _signature
) external nonReentrant {
    // Validate timestamp is recent (within 7 days)
    require(
        block.timestamp - _timestamp < 7 days,
        "Refund ticket expired"
    );

    require(
        _timestamp <= block.timestamp,
        "Timestamp in future"
    );

    // ... rest of validation
}
```

---

### P1-6: Double-Spend Slashing Logic Is Flawed

**Severity:** 🟠 High
**Location:** [ZkApiCredits.sol:200-231](contracts/src/ZkApiCredits.sol#L200)

**Description:**
The slashing function requires nullifiers to match, but in RLN, double-spend uses same `a` (thus same nullifier) with different `x`.

**Vulnerable Code:**
```solidity
// Verify the secret key was correctly extracted from two different signals
require(_nullifier1 == _nullifier2, "Nullifiers must match");
require(_signal1.x != _signal2.x, "Signals must differ");
```

**Impact:**
- Incorrect slashing conditions
- Real double-spends may not be slashable
- False positives possible
- **Security bypass:** Double-spenders escape punishment

**RLN Mathematics:**

In Rate-Limit Nullifiers:
- Nullifier = Hash(a_0, externalNullifier)
- Signal y = a_1 * x + k (mod p)

Double-spend detection:
- If user makes two requests with same `a_0` but different `x` values
- We can extract secret `k` from two signals

**Remediation:**

Implement proper RLN verification:

```solidity
function slashDoubleSpend(
    bytes32 _nullifier1,
    RLNSignal calldata _signal1,
    bytes32 _nullifier2,
    RLNSignal calldata _signal2,
    bytes32 _idCommitment
) external nonReentrant {
    // 1. Verify both signals have same nullifier
    require(_nullifier1 == _nullifier2, "Nullifiers must match");

    // 2. Verify signals are different
    require(
        _signal1.x != _signal2.x || _signal1.y != _signal2.y,
        "Signals must differ"
    );

    // 3. Extract secret key using field arithmetic
    uint256 secretKey = extractSecretKeyField(
        _signal1.x, _signal1.y,
        _signal2.x, _signal2.y
    );

    // 4. Verify extracted key matches commitment
    uint256 computedCommitment = PoseidonT2.hash([secretKey]);
    require(
        bytes32(computedCommitment) == _idCommitment,
        "Secret key mismatch"
    );

    // 5. Slash user
    _slash(_idCommitment, msg.sender);
}

function extractSecretKeyField(
    uint256 x1, uint256 y1,
    uint256 x2, uint256 y2
) internal pure returns (uint256) {
    // Field prime for BN254
    uint256 p = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // numerator = y1*x2 - y2*x1 (mod p)
    uint256 numerator = addmod(
        mulmod(y1, x2, p),
        p - mulmod(y2, x1, p),
        p
    );

    // denominator = x2 - x1 (mod p)
    uint256 denominator = addmod(x2, p - x1, p);

    // k = numerator * denominator^-1 (mod p)
    uint256 denominatorInv = modInverse(denominator, p);
    return mulmod(numerator, denominatorInv, p);
}
```

---

### P1-7: No Maximum Refund Value Validation

**Severity:** 🟠 High
**Location:** [ZkApiCredits.sol:276-307](contracts/src/ZkApiCredits.sol#L276)

**Description:**
Refund value is not validated against maximum possible cost.

**Impact:**
- Malicious server could sign refunds larger than deposits
- Economic loss when users redeem inflated refunds
- **Economic attack:** Drain contract funds

**Remediation:**

```solidity
function redeemRefund(
    bytes32 _nullifier,
    uint256 _refundValue,
    uint256 _timestamp,
    address _recipient,
    EdDSASignature calldata _signature
) external nonReentrant {
    // Find deposit for this nullifier
    bytes32 idCommitment = findCommitmentByNullifier(_nullifier);
    Deposit storage deposit = deposits[idCommitment];

    // Validate refund doesn't exceed deposit
    require(
        _refundValue <= deposit.rlnStake,
        "Refund exceeds deposit"
    );

    // Validate user hasn't redeemed more than deposited
    uint256 totalRedeemed = redeemedAmounts[idCommitment];
    require(
        totalRedeemed + _refundValue <= deposit.rlnStake,
        "Total refunds exceed deposit"
    );

    // ... rest of logic

    redeemedAmounts[idCommitment] += _refundValue;
}
```

---

### P1-8: SIWE Nonce Cleanup Race Condition

**Severity:** 🟠 High
**Location:** [siwe.service.ts:77-84](src/auth/siwe.service.ts#L77)

**Description:**
Nonce cleanup iterates over map while it can be modified.

**Vulnerable Code:**
```typescript
private cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, entry] of this.nonces.entries()) {
    if (now - entry.createdAt > this.NONCE_TTL) {
      this.nonces.delete(nonce); // Modifying during iteration
    }
  }
}
```

**Impact:**
- Potential iterator invalidation
- Missed deletions or errors
- **DoS:** Nonce map grows unbounded

**Remediation:**

```typescript
private cleanExpiredNonces(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  // First pass: collect expired nonces
  for (const [nonce, entry] of this.nonces.entries()) {
    if (now - entry.createdAt > this.NONCE_TTL) {
      toDelete.push(nonce);
    }
  }

  // Second pass: delete expired nonces
  toDelete.forEach(nonce => this.nonces.delete(nonce));

  this.logger.debug(`Cleaned ${toDelete.length} expired nonces`);
}
```

---

### P1-9: Merkle Tree Zero Hash Computation Missing Safety Checks

**Severity:** 🟠 High
**Location:** [merkle-tree.service.ts:74-85](src/zk-api/merkle-tree.service.ts#L74)

**Description:**
Zero hash computation doesn't validate Poseidon initialization.

**Impact:**
- Silent failures if Poseidon not initialized
- Invalid Merkle proofs
- **System failure:** Proof generation breaks

**Remediation:**

```typescript
private async computeZeroHashes() {
  if (!this.poseidon) {
    throw new Error('Poseidon hash function not initialized');
  }

  this.zeroHashes[0] = 0n;

  for (let i = 1; i <= this.TREE_DEPTH; i++) {
    const prev = this.zeroHashes[i - 1];
    this.zeroHashes[i] = this.poseidon([prev, prev]);

    // Validate hash is non-zero
    if (this.zeroHashes[i] === 0n) {
      throw new Error(`Invalid zero hash at level ${i}`);
    }
  }

  this.logger.debug('Zero hashes computed', {
    depth: this.TREE_DEPTH,
    rootHash: this.zeroHashes[this.TREE_DEPTH].toString(16)
  });
}
```

---

### P1-10: No Validation of ML-KEM Ciphertext Components

**Severity:** 🟠 High
**Location:** [mlkem-encryption.service.ts:131-203](src/encryption/mlkem-encryption.service.ts#L131)

**Description:**
Multi-recipient decryption doesn't validate IV or auth tag lengths.

**Impact:**
- Malformed payloads could cause crashes
- Possible padding oracle attacks
- **DoS:** Crash through invalid ciphertext

**Remediation:**

```typescript
async decryptForRecipient(
  encryptedPayload: EncryptedPayload,
  recipientKeyPair: { secretKey: Uint8Array; publicKey: Uint8Array }
): Promise<string> {
  // Find recipient's encapsulated key
  const recipientEncKey = encryptedPayload.recipients.find(
    r => Buffer.from(r.publicKey, 'base64').equals(recipientKeyPair.publicKey)
  );

  if (!recipientEncKey) {
    throw new Error('Not a recipient');
  }

  // Validate ciphertext components
  const ciphertext = Buffer.from(recipientEncKey.ciphertext, 'base64');
  if (ciphertext.length !== 1088) { // ML-KEM-768 ciphertext size
    throw new Error('Invalid ciphertext length');
  }

  const iv = Buffer.from(encryptedPayload.iv, 'base64');
  if (iv.length !== 12) {
    throw new Error('Invalid IV length (expected 12 bytes)');
  }

  const authTag = Buffer.from(encryptedPayload.authTag, 'base64');
  if (authTag.length !== 16) {
    throw new Error('Invalid auth tag length (expected 16 bytes)');
  }

  // ... proceed with decryption
}
```

---

### P1-11: TEE Attestation Not Verified by KMS

**Severity:** 🟠 High
**Location:** [secrets.service.ts:59-82](src/config/secrets.service.ts#L59)

**Description:**
Attestation is sent to KMS but no response validation shown.

**Impact:**
- If KMS is compromised, secrets leaked without real attestation
- No proof that attestation was actually verified
- **Trust violation:** TEE security bypassed

**Remediation:**

```typescript
async getSecretFromKms(secretName: string): Promise<string> {
  // Generate attestation
  const attestation = await this.teePlatform.generateAttestation();

  // Send to KMS with attestation
  const response = await this.kmsClient.getSecret({
    secretName,
    attestation: attestation.quote,
    attestationCert: attestation.certificate
  });

  // CRITICAL: Verify KMS actually validated attestation
  if (!response.attestationVerified) {
    throw new Error('KMS did not verify attestation');
  }

  // Verify measurement hash matches expected
  const expectedMeasurement = process.env.EXPECTED_TEE_MEASUREMENT;
  if (response.measurement !== expectedMeasurement) {
    throw new Error('TEE measurement mismatch');
  }

  // Verify certificate chain
  await this.verifyCertificateChain(attestation.certificate);

  return response.secret;
}
```

---

### P1-12: Blockchain Service Doesn't Validate Chain ID

**Severity:** 🟠 High
**Location:** [blockchain.service.ts:23-61](src/zk-api/blockchain.service.ts#L23)

**Description:**
No check that connected to correct network.

**Impact:**
- Could connect to wrong network (testnet vs mainnet)
- Wrong contract interactions
- Fund loss
- **Financial loss:** Wrong network transactions

**Remediation:**

```typescript
@Injectable()
export class BlockchainService implements OnModuleInit {
  async onModuleInit() {
    const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Validate chain ID
    const network = await this.provider.getNetwork();
    const chainId = network.chainId;
    const expectedChainId = BigInt(this.configService.get<string>('CHAIN_ID'));

    if (chainId !== expectedChainId) {
      throw new Error(
        `Wrong network: connected to chain ${chainId}, expected ${expectedChainId}`
      );
    }

    this.logger.log(`Connected to chain ${chainId}`);

    // Validate contract exists
    const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS');
    const code = await this.provider.getCode(contractAddress);

    if (code === '0x') {
      throw new Error(`No contract at address ${contractAddress}`);
    }
  }
}
```

---

## 3. Medium Severity Issues (P2)

### P2-1: No Input Sanitization for Payload Field

**Severity:** 🟡 Medium
**Location:** [api-request.dto.ts:24-27](src/zk-api/dto/api-request.dto.ts#L24)

**Description:**
User payload is not sanitized before being passed to Claude API or logged.

**Impact:**
- Potential prompt injection attacks
- Log injection if payload logged
- Excessive token usage from huge payloads

**Remediation:**
```typescript
@IsString()
@IsNotEmpty()
@MaxLength(100000) // Limit payload size
@Matches(/^[\x20-\x7E\n\r\t]+$/, {
  message: 'Payload contains invalid characters'
})
payload: string;
```

---

### P2-2: No Rate Limiting on ZK API Endpoints

**Severity:** 🟡 Medium
**Location:** [app.module.ts:23-28](src/app.module.ts#L23)

**Description:**
Global rate limit (10 req/min) applies to all endpoints, not specifically to expensive ZK verification.

**Impact:**
- DoS through expensive proof verification
- No per-nullifier rate limiting
- IP-based limiting easily bypassed

**Remediation:**

```typescript
// app.module.ts
ThrottlerModule.forRoot([
  {
    name: 'global',
    ttl: 60000,
    limit: 10
  },
  {
    name: 'zk-proof',
    ttl: 60000,
    limit: 1 // Stricter for proof verification
  }
])

// zk-api.controller.ts
@Throttle({ zk-proof: { ttl: 60000, limit: 1 } })
@Post('request')
async handleRequest(@Body() req: ApiRequestDto) {
  // ...
}
```

---

### P2-3: Error Messages Leak Implementation Details

**Severity:** 🟡 Medium
**Location:** [tee-exception.filter.ts:42-52](src/filters/tee-exception.filter.ts#L42)

**Description:**
While the filter sanitizes 500 errors, other errors expose messages.

**Impact:**
- Information disclosure about internal state
- Helps attackers understand system behavior

**Remediation:**

```typescript
const isProd = process.env.NODE_ENV === 'production';

message: isProd && status >= 400
  ? this.sanitizeErrorMessage(status)
  : exception instanceof HttpException
    ? exception.message
    : 'Internal server error',

private sanitizeErrorMessage(status: number): string {
  const messages = {
    400: 'Bad request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not found',
    429: 'Too many requests',
    500: 'Internal server error',
    503: 'Service unavailable'
  };
  return messages[status] || 'Error';
}
```

---

### P2-4: No Proof of Authority for Policy Slashing

**Severity:** 🟡 Medium
**Location:** [ZkApiCredits.sol:240-264](contracts/src/ZkApiCredits.sol#L240)

**Description:**
Server can burn policy stake with only placeholder proof verification.

**Impact:**
- Malicious server could burn stakes without valid ToS violations
- No accountability for server actions

**Remediation:**
Implement proper ZK proof verification that links nullifier to ToS violation evidence.

---

### P2-5: Swagger Documentation Exposed in Production

**Severity:** 🟡 Medium
**Location:** [main.ts:48-55](src/main.ts#L48)

**Description:**
API documentation enabled in all environments.

**Impact:**
- Information disclosure about API structure
- Easier attack surface enumeration

**Remediation:**

```typescript
const isProd = process.env.NODE_ENV === 'production';

if (!isProd) {
  const config = new DocumentBuilder()
    .setTitle('ZK API')
    .setDescription('API documentation for ZK API')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
}
```

---

### P2-6: No Timeout on External API Calls

**Severity:** 🟡 Medium
**Location:** [zk-api.service.ts:195-199](src/zk-api/zk-api.service.ts#L195)

**Description:**
Claude API call has no timeout configured.

**Impact:**
- Hanging requests block resources
- DoS through slow API responses

**Remediation:**

```typescript
async callClaudeApi(payload: string, model: string): Promise<string> {
  const timeoutMs = 30000; // 30 seconds

  const message = await Promise.race([
    this.anthropic.messages.create({
      model: model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: payload }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('API timeout')), timeoutMs)
    )
  ]);

  return message.content[0].text;
}
```

---

### P2-7: Chest Storage Uses Synchronous File Operations

**Severity:** 🟡 Medium
**Location:** [secret.service.ts:234-246](src/secret/secret.service.ts#L234)

**Description:**
File writes use async API but reads could use sync in error cases.

**Impact:**
- Potential blocking of event loop
- Performance degradation

**Remediation:**
Consistently use async file operations throughout.

---

### P2-8: No Input Validation on Ethereum Addresses

**Severity:** 🟡 Medium
**Location:** [api-request.dto.ts:106-108](src/zk-api/dto/api-request.dto.ts#L106)

**Description:**
Recipient address validated in DTO but not in smart contract.

**Impact:**
- Funds could be sent to invalid addresses
- Loss of funds

**Remediation:**

```solidity
function redeemRefund(
    bytes32 _nullifier,
    uint256 _refundValue,
    uint256 _timestamp,
    address _recipient,
    EdDSASignature calldata _signature
) external nonReentrant {
    require(_recipient != address(0), "Invalid recipient");
    require(_recipient != address(this), "Cannot send to contract");
    // ...
}
```

---

### P2-9: Mock Attestation Doesn't Clearly Fail in Production

**Severity:** 🟡 Medium
**Location:** [tee-platform.service.ts:335-350](src/attestation/tee-platform.service.ts#L335)

**Description:**
Mock attestation generates warnings but doesn't fail hard.

**Impact:**
- Non-TEE environment could be used accidentally in production
- Security assumptions violated

**Remediation:**

```typescript
private async generateMockAttestation(): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Mock attestation not allowed in production');
  }

  this.logger.warn('⚠️  USING MOCK ATTESTATION - NOT FOR PRODUCTION');
  // ...
}
```

---

### P2-10: No Protection Against Front-Running of Slashing

**Severity:** 🟡 Medium
**Location:** [ZkApiCredits.sol:200-231](contracts/src/ZkApiCredits.sol#L200)

**Description:**
Anyone can submit slashing transaction; MEV bots can front-run.

**Impact:**
- Legitimate reporter loses gas fees
- MEV extraction from slashing rewards

**Remediation:**

1. Use Flashbots for slashing transactions
2. Implement commit-reveal scheme
3. Add reporter rewards with time lock

---

### P2-11: Insufficient Logging for Security Events

**Severity:** 🟡 Medium
**Location:** Throughout codebase

**Description:**
Critical events not logged comprehensively.

**Impact:**
- Difficult forensics after incidents
- No audit trail

**Remediation:**

Add structured logging for:
- All proof verification attempts
- Nullifier reuse attempts
- Refund redemptions
- Slashing events

---

### P2-12: No Health Check for Critical Dependencies

**Severity:** 🟡 Medium
**Location:** [health.controller.ts](src/health/health.controller.ts)

**Description:**
Health checks don't validate blockchain connection, oracle, etc.

**Impact:**
- Service appears healthy while critical features broken

**Remediation:**

```typescript
@Get('health/ready')
async readiness() {
  const checks = await Promise.all([
    this.blockchainService.isConnected(),
    this.ethRateOracle.getEthUsdRate().then(() => true).catch(() => false),
    this.nullifierStore.isAvailable()
  ]);

  if (checks.some(c => !c)) {
    throw new ServiceUnavailableException('Dependencies unavailable');
  }

  return { status: 'ready' };
}
```

---

### P2-13: Helmet Configuration May Be Insufficient

**Severity:** 🟡 Medium
**Location:** [main.ts:28](src/main.ts#L28)

**Description:**
Helmet used with defaults; may need stricter CSP.

**Remediation:**

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://api.kraken.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

---

### P2-14: CORS Disabled in Production Without Justification

**Severity:** 🟡 Medium
**Location:** [main.ts:31-34](src/main.ts#L31)

**Description:**
CORS disabled in production by default.

**Impact:**
- May break legitimate frontend integrations

**Remediation:**

```typescript
app.enableCors({
  origin: isProd
    ? ['https://app.zkapi.example.com']
    : '*',
  credentials: true,
});
```

---

### P2-15: No Circuit Constraint Analysis

**Severity:** 🟡 Medium
**Location:** [api_credit_proof.circom](circuits/api_credit_proof.circom)

**Description:**
No documented analysis of constraint count or proving time.

**Impact:**
- Unknown performance characteristics
- Possible DoS through expensive proof generation

**Remediation:**

1. Run `circom --r1cs` analysis
2. Document expected constraints
3. Add test for maximum proving time

---

## 4. Low Severity Issues (P3)

### P3-1: Deprecated Cryptographic Hash for Dev Keys

**Severity:** 🟢 Low
**Location:** [refund-signer.service.ts:72-77](src/zk-api/refund-signer.service.ts#L72)

Use proper CSPRNG: `randomBytes(32)`

---

### P3-2: Hard-Coded Magic Numbers in Circuit

**Severity:** 🟢 Low
**Location:** [api_credit_proof.circom:151](circuits/api_credit_proof.circom#L151)

Use template parameters for flexibility.

---

### P3-3: Insufficient Test Coverage for Edge Cases

**Severity:** 🟢 Low

Add tests for:
- Maximum refund tickets (100)
- Maximum Merkle tree depth (20)
- Overflow conditions
- Concurrent requests

---

### P3-4: No Metrics or Monitoring Integration

**Severity:** 🟢 Low

Add Prometheus/Grafana metrics for:
- Proof verification time
- Nullifier store size
- API request latency
- Error rates

---

### P3-5: Console.log Used Instead of Logger

**Severity:** 🟢 Low
**Location:** [main.ts:65](src/main.ts#L65)

Use NestJS Logger instead of console.log.

---

### P3-6: No Documentation for Key Rotation

**Severity:** 🟢 Low

Document key rotation procedures.

---

### P3-7: Development Dependencies in Production Build

**Severity:** 🟢 Low
**Location:** [Dockerfile:32](Dockerfile#L32)

Already uses two-stage build correctly.

---

### P3-8: No Automated Dependency Scanning

**Severity:** 🟢 Low

Enable Dependabot or Snyk integration.

---

## 5. Security Best Practice Recommendations

### 5.1 Cryptography

1. **Implement proper EdDSA**: Use `@noble/curves` or `circomlibjs`
2. **Audit ZK circuits**: Conduct formal verification
3. **Complete trusted setup**: Run Powers of Tau ceremony
4. **Use Poseidon consistently**: Match hash functions
5. **Implement field arithmetic**: Use proper finite field operations

### 5.2 Infrastructure

1. **Persistent storage**: Migrate to Redis/PostgreSQL
2. **HSM/KMS integration**: Hardware security modules
3. **Multi-oracle pricing**: Use Chainlink
4. **Event monitoring**: Blockchain event listeners
5. **Distributed architecture**: Horizontal scaling

### 5.3 Smart Contracts

1. **Full security audit**: Before mainnet
2. **Implement Poseidon**: Replace Keccak256
3. **Add timelock**: For admin operations
4. **Gas optimization**: Analyze costs
5. **Emergency pause**: Test mechanisms

### 5.4 Application Security

1. **Input validation**: Comprehensive validation
2. **Rate limiting**: Granular limits
3. **Secure logging**: Never log secrets
4. **Error handling**: Sanitize messages
5. **Security headers**: Strict CSP

### 5.5 Operations

1. **Monitoring**: Comprehensive alerting
2. **Incident response**: Document procedures
3. **Key rotation**: Establish procedures
4. **Backup**: Regular backups
5. **Security updates**: Automated scanning

---

## 6. Positive Security Observations

The following security measures are well-implemented:

✅ **Sanitized Logging**: Prevents leakage in TEE
✅ **Global Exception Filter**: Prevents information disclosure
✅ **Input Validation**: class-validator DTOs
✅ **ReentrancyGuard**: Smart contract protection
✅ **Pausable Contract**: Emergency functionality
✅ **SIWE Authentication**: Ethereum signature auth
✅ **ML-KEM (Post-Quantum)**: Future-proof encryption
✅ **TEE Platform Detection**: Multi-platform support
✅ **Helmet Security Headers**: HTTP security
✅ **Environment Validation**: Required config
✅ **Docker Multi-Stage Build**: Reduced attack surface
✅ **Rate Limiting**: Basic DoS protection
✅ **Nonce Single-Use**: Proper invalidation
✅ **Separate Test Environment**: Clear separation
✅ **Comprehensive Documentation**: Well-documented

---

## 7. Compliance & Regulatory Considerations

### 7.1 GDPR/Privacy

**Concern**: Nullifier store may contain user metadata
**Recommendation**: Document data retention policy, add deletion endpoints

### 7.2 Financial Regulations

**Concern**: System handles financial transactions
**Recommendation**: Consult legal counsel on money transmission licenses

### 7.3 Terms of Service

**Concern**: Policy slashing requires enforceable ToS
**Recommendation**: Draft comprehensive acceptable use policy

---

## 8. Conclusion & Roadmap

The ZK API codebase demonstrates innovative use of Zero-Knowledge proofs, Rate-Limit Nullifiers, and TEE technology. The architecture is well-designed and shows security awareness.

However, **the system is NOT production-ready** due to critical vulnerabilities.

### Production Readiness Timeline

**Phase 1: Critical Fixes (4-6 weeks)**
- ✅ Implement proper EdDSA
- ✅ Add persistent storage
- ✅ Fix hash function compatibility
- ✅ Integrate HSM/KMS

**Phase 2: High Priority (3-4 weeks)**
- ✅ Complete ZK proof verification
- ✅ Multi-oracle pricing
- ✅ Smart contract improvements
- ✅ Comprehensive testing

**Phase 3: Security Hardening (2-3 weeks)**
- ✅ Security audit (contracts + circuits)
- ✅ Penetration testing
- ✅ Monitoring and alerting
- ✅ Documentation updates

**Total Estimated Time**: 9-13 weeks (2.25-3.25 months)

### Recommended Next Steps

1. Address all P0 issues immediately
2. Conduct formal audit of smart contracts and ZK circuits
3. Complete trusted setup ceremony
4. Deploy to testnet for public testing
5. Bug bounty program before mainnet
6. Gradual mainnet rollout with deposit limits

---

**End of Security Audit Report**
