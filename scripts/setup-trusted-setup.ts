#!/usr/bin/env ts-node

/**
 * Script to complete the trusted setup for ZK circuits
 *
 * This performs the Powers of Tau ceremony and generates
 * the proving and verification keys for the circuit.
 *
 * Usage:
 *   npm run setup:circuit
 *
 * Or directly:
 *   npx ts-node scripts/setup-trusted-setup.ts
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const CIRCUITS_DIR = join(__dirname, '../circuits');
const BUILD_DIR = join(CIRCUITS_DIR, 'build');
const CIRCUIT_NAME = 'api_credit_proof_test';

// Ensure build directory exists
if (!existsSync(BUILD_DIR)) {
  mkdirSync(BUILD_DIR, { recursive: true });
}

console.log('=== ZK Circuit Trusted Setup ===\n');

// Check if already setup
const zkeyPath = join(BUILD_DIR, `${CIRCUIT_NAME}_final.zkey`);
const vkeyPath = join(BUILD_DIR, 'verification_key.json');

if (existsSync(zkeyPath) && existsSync(vkeyPath)) {
  console.log('✓ Trusted setup already completed');
  console.log(`  zkey: ${zkeyPath}`);
  console.log(`  vkey: ${vkeyPath}`);
  process.exit(0);
}

function run(command: string, description: string) {
  console.log(`\n${description}...`);
  try {
    execSync(command, {
      cwd: BUILD_DIR,
      stdio: 'inherit',
      maxBuffer: 1024 * 1024 * 100, // 100MB buffer
    });
    console.log(`✓ ${description} completed`);
  } catch (error) {
    console.error(`✗ ${description} failed`);
    throw error;
  }
}

try {
  // Step 1: Compile circuit (if not already done)
  const wasmPath = join(BUILD_DIR, `${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm`);
  const r1csPath = join(BUILD_DIR, `${CIRCUIT_NAME}.r1cs`);

  if (!existsSync(wasmPath) || !existsSync(r1csPath)) {
    console.log('Compiling circuit...');
    run(
      `circom ${join(CIRCUITS_DIR, `${CIRCUIT_NAME}.circom`)} --r1cs --wasm --sym -o ${BUILD_DIR}`,
      'Circuit compilation',
    );
  } else {
    console.log('✓ Circuit already compiled');
  }

  // Step 2: Generate Powers of Tau (if not exists)
  const ptauPath = join(BUILD_DIR, 'pot12_final.ptau');
  if (!existsSync(ptauPath)) {
    console.log('\nGenerating Powers of Tau (this may take a few minutes)...');

    // Generate initial ceremony
    run(
      'npx snarkjs powersoftau new bn128 12 pot12_0000.ptau',
      'Powers of Tau initialization',
    );

    // Contribute to ceremony
    run(
      'npx snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution" -e="random entropy"',
      'Contribution to Powers of Tau',
    );

    // Prepare phase 2
    run(
      'npx snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau',
      'Prepare phase 2',
    );
  } else {
    console.log('✓ Powers of Tau already generated');
  }

  // Step 3: Generate proving key
  console.log('\nGenerating proving key (this may take several minutes)...');
  run(
    `npx snarkjs groth16 setup ${CIRCUIT_NAME}.r1cs pot12_final.ptau ${CIRCUIT_NAME}_0000.zkey`,
    'Groth16 setup',
  );

  // Step 4: Contribute to phase 2
  run(
    `npx snarkjs zkey contribute ${CIRCUIT_NAME}_0000.zkey ${CIRCUIT_NAME}_final.zkey --name="Circuit contribution" -e="more random entropy"`,
    'Circuit-specific contribution',
  );

  // Step 5: Export verification key
  run(
    `npx snarkjs zkey export verificationkey ${CIRCUIT_NAME}_final.zkey verification_key.json`,
    'Export verification key',
  );

  // Step 6: Verify the final zkey
  run(
    `npx snarkjs zkey verify ${CIRCUIT_NAME}.r1cs pot12_final.ptau ${CIRCUIT_NAME}_final.zkey`,
    'Verify final zkey',
  );

  console.log('\n=== Trusted Setup Complete ===');
  console.log(`\nGenerated files in ${BUILD_DIR}:`);
  console.log(`  - ${CIRCUIT_NAME}_final.zkey (proving key)`);
  console.log(`  - verification_key.json (verification key)`);
  console.log(`  - pot12_final.ptau (Powers of Tau)`);
  console.log('\n✓ Circuit is ready for production use');
} catch (error) {
  console.error('\n✗ Trusted setup failed:', error);
  process.exit(1);
}
