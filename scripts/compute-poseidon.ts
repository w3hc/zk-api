#!/usr/bin/env ts-node
/**
 * Compute Poseidon hash for identity commitments
 * Usage: ts-node scripts/compute-poseidon.ts <secretKey>
 */

// @ts-ignore - circomlibjs doesn't have types
const { buildPoseidon } = require('circomlibjs');

async function computePoseidonHash(secretKey: string) {
  const poseidon = await buildPoseidon();

  // Remove 0x prefix if present
  const cleanKey = secretKey.startsWith('0x') ? secretKey.slice(2) : secretKey;

  // Convert hex string to BigInt
  const secretKeyBigInt = BigInt('0x' + cleanKey);

  // Compute Poseidon hash
  const hash = poseidon([secretKeyBigInt]);

  // Convert to hex string with 0x prefix
  const hashHex = '0x' + poseidon.F.toString(hash, 16).padStart(64, '0');

  return hashHex;
}

async function main() {
  const secretKey = process.argv[2];

  if (!secretKey) {
    console.error('Usage: ts-node scripts/compute-poseidon.ts <secretKey>');
    console.error(
      'Example: ts-node scripts/compute-poseidon.ts 0x1234567890abcdef...',
    );
    process.exit(1);
  }

  try {
    const hash = await computePoseidonHash(secretKey);
    console.log(hash);
  } catch (error) {
    console.error('Error computing Poseidon hash:', error);
    process.exit(1);
  }
}

main();
