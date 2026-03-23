#!/usr/bin/env ts-node
/**
 * Client-side utility for generating ZK proofs for API access
 *
 * Usage:
 *   ts-node scripts/generate-proof.ts <secretKey> <ticketIndex>
 */

const circomlibjs = require('circomlibjs');
import { ethers } from 'ethers';

interface ProofInput {
  secretKey: bigint;
  ticketIndex: bigint;
  signalX: bigint;
  merkleRoot: string;
  maxCost: string;
  initialDeposit: string;
}

async function generateIdCommitment(poseidon: any, secretKey: bigint): Promise<bigint> {
  const F = poseidon.F;
  return F.toObject(poseidon([secretKey]));
}

async function generateRLNSignal(
  poseidon: any,
  secretKey: bigint,
  ticketIndex: bigint,
  signalX: bigint,
): Promise<{
  nullifier: bigint;
  signalY: bigint;
  a: bigint;
}> {
  const F = poseidon.F;

  // a = Hash(secretKey, ticketIndex)
  const a = F.toObject(poseidon([secretKey, ticketIndex]));

  // nullifier = Hash(a)
  const nullifier = F.toObject(poseidon([a]));

  // signalY = secretKey + a * signalX (using field arithmetic)
  const signalY = F.toObject(F.add(F.e(secretKey), F.mul(F.e(a), F.e(signalX))));

  return { nullifier, signalY, a };
}

async function generateMockProof(input: ProofInput) {
  console.log('\n🔐 Generating ZK Proof...\n');

  // Initialize Poseidon hash
  const poseidon = await circomlibjs.buildPoseidon();

  // Generate public outputs
  const idCommitment = await generateIdCommitment(poseidon, input.secretKey);
  const { nullifier, signalY } = await generateRLNSignal(
    poseidon,
    input.secretKey,
    input.ticketIndex,
    input.signalX,
  );

  console.log('Private Inputs:');
  console.log(`  Secret Key: ${input.secretKey}`);
  console.log(`  Ticket Index: ${input.ticketIndex}`);
  console.log();

  console.log('Public Inputs:');
  console.log(`  Signal X: ${input.signalX}`);
  console.log(`  Merkle Root: ${input.merkleRoot}`);
  console.log(`  Max Cost: ${input.maxCost}`);
  console.log(`  Initial Deposit: ${input.initialDeposit}`);
  console.log();

  console.log('Public Outputs:');
  console.log(`  ID Commitment: 0x${idCommitment.toString(16)}`);
  console.log(`  Nullifier: 0x${nullifier.toString(16)}`);
  console.log(`  Signal Y: ${signalY}`);
  console.log();

  // Generate mock Groth16 proof
  const proofData = {
    pi_a: [
      ethers.hexlify(ethers.randomBytes(32)),
      ethers.hexlify(ethers.randomBytes(32)),
    ],
    pi_b: [
      [ethers.hexlify(ethers.randomBytes(32)), ethers.hexlify(ethers.randomBytes(32))],
      [ethers.hexlify(ethers.randomBytes(32)), ethers.hexlify(ethers.randomBytes(32))],
    ],
    pi_c: [
      ethers.hexlify(ethers.randomBytes(32)),
      ethers.hexlify(ethers.randomBytes(32)),
    ],
    protocol: 'groth16',
  };

  const proof = JSON.stringify(proofData, null, 2);

  const publicInputs = {
    merkleRoot: input.merkleRoot,
    maxCost: input.maxCost,
    initialDeposit: input.initialDeposit,
    signalX: '0x' + input.signalX.toString(16).padStart(64, '0'),
    nullifier: '0x' + nullifier.toString(16).padStart(64, '0'),
    signalY: '0x' + signalY.toString(16).padStart(64, '0'),
    idCommitment: '0x' + idCommitment.toString(16).padStart(64, '0'),
  };

  console.log('✅ Proof generated successfully!\n');

  return { proof, publicInputs };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: ts-node scripts/generate-proof.ts <secretKey> <ticketIndex>');
    console.error('');
    console.error('Example:');
    console.error('  ts-node scripts/generate-proof.ts 12345 0');
    process.exit(1);
  }

  const secretKey = BigInt(args[0]);
  const ticketIndex = BigInt(args[1]);

  // Use random signalX for this request
  const signalX = BigInt(ethers.hexlify(ethers.randomBytes(32)));

  // Example values - in production these would come from the contract
  const merkleRoot = ethers.hexlify(ethers.randomBytes(32));
  const maxCost = ethers.parseEther('0.001').toString();
  const initialDeposit = ethers.parseEther('0.1').toString();

  const input: ProofInput = {
    secretKey,
    ticketIndex,
    signalX,
    merkleRoot,
    maxCost,
    initialDeposit,
  };

  const { proof, publicInputs } = await generateMockProof(input);

  console.log('Proof (JSON):');
  console.log(proof);
  console.log();

  console.log('Public Inputs (JSON):');
  console.log(JSON.stringify(publicInputs, null, 2));
  console.log();

  console.log('📋 To use this proof with the API:');
  console.log(`
  curl -X POST http://localhost:3000/zk-api/chat \\
    -H "Content-Type: application/json" \\
    -d '{
      "proof": ${JSON.stringify(proof)},
      "publicInputs": ${JSON.stringify(publicInputs)},
      "messages": [{"role": "user", "content": "Hello!"}]
    }'
  `);
}

main().catch(console.error);
