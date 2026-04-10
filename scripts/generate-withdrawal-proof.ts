#!/usr/bin/env ts-node

/**
 * Generate a withdrawal ZK proof
 * Usage: ts-node generate-withdrawal-proof.ts <secretKey> <merkleRoot> <leafIndex>
 */

import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import * as path from 'path';
import * as fs from 'fs';

async function generateWithdrawalProof(
  secretKey: string,
  merkleRoot: string,
  leafIndex: number
): Promise<{ proof: any; publicSignals: string[] }> {
  const poseidon = await buildPoseidon();

  // Convert secret key to field element
  const secretKeyBigInt = BigInt(secretKey);

  // Compute identity commitment: Poseidon(secretKey)
  const idCommitmentArray = poseidon([secretKeyBigInt]);
  const idCommitment = poseidon.F.toString(idCommitmentArray);

  console.error(`Secret Key: ${secretKey}`);
  console.error(`Identity Commitment: 0x${BigInt(idCommitment).toString(16).padStart(64, '0')}`);
  console.error(`Merkle Root: ${merkleRoot}`);
  console.error(`Leaf Index: ${leafIndex}`);

  // For withdrawal, we need:
  // - secretKey (private)
  // - merkleRoot (public)
  // - pathElements (from contract's getMerkleProof)
  // - pathIndices (from contract's getMerkleProof)

  // Generate RLN signal for withdrawal
  const ticketIndex = 0; // Withdrawal uses ticket index 0
  const externalNullifier = BigInt(merkleRoot);

  // RLN: a = Poseidon(secretKey, ticketIndex)
  const aArray = poseidon([secretKeyBigInt, BigInt(ticketIndex)]);
  const a = poseidon.F.toString(aArray);

  // nullifier = Poseidon(a)
  const nullifierArray = poseidon([BigInt(a)]);
  const nullifier = poseidon.F.toString(nullifierArray);

  // RLN signal: x = Poseidon(externalNullifier)
  const xArray = poseidon([externalNullifier]);
  const x = poseidon.F.toString(xArray);

  // y = secretKey + a * x
  const y = poseidon.F.toString(
    poseidon.F.add(secretKeyBigInt, poseidon.F.mul(BigInt(a), BigInt(x)))
  );

  console.error(`Nullifier: 0x${BigInt(nullifier).toString(16).padStart(64, '0')}`);
  console.error(`Signal X: ${x}`);
  console.error(`Signal Y: ${y}`);

  // Check if withdrawal circuit is compiled
  const wasmPath = path.join(__dirname, '../circuits/build/withdrawal/withdrawal_js/withdrawal.wasm');
  const zkeyPath = path.join(__dirname, '../circuits/build/withdrawal/withdrawal_final.zkey');

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    throw new Error(
      'Withdrawal circuit not compiled. Run: cd circuits && bash scripts/compile-production-circuits.sh'
    );
  }

  // For this script to work, we need the Merkle path from the contract
  // Since we can't easily call the contract from here, we'll use mock path for depth-20 tree
  const pathElements = new Array(20).fill('0');
  const pathIndices = new Array(20).fill(0);
  pathIndices[0] = leafIndex % 2;

  // Circuit inputs
  const input = {
    secretKey: secretKeyBigInt.toString(),
    externalNullifier: externalNullifier.toString(),
    merkleRoot: BigInt(merkleRoot).toString(),
    pathElements: pathElements,
    pathIndices: pathIndices,
    ticketIndex: ticketIndex.toString(),
  };

  console.error('\nGenerating proof (this may take 2-5 seconds)...');

  // Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  console.error('✓ Proof generated successfully');

  return { proof, publicSignals };
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('Usage: ts-node generate-withdrawal-proof.ts <secretKey> <merkleRoot> <leafIndex>');
  console.error('Example: ts-node generate-withdrawal-proof.ts 0x1234... 0x5678... 0');
  process.exit(1);
}

const secretKey = args[0];
const merkleRoot = args[1];
const leafIndex = parseInt(args[2]);

generateWithdrawalProof(secretKey, merkleRoot, leafIndex)
  .then(({ proof, publicSignals }) => {
    console.log(JSON.stringify({ proof, publicSignals }, null, 2));
  })
  .catch((error) => {
    console.error('Error generating withdrawal proof:', error.message);
    process.exit(1);
  });
