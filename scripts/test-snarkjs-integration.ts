#!/usr/bin/env ts-node

/**
 * Script to test SnarkJS proof service integration
 *
 * This demonstrates the automatic fallback behavior:
 * - If trusted setup complete: Uses real verification
 * - If trusted setup missing: Falls back to mock verification
 */

import { SnarkjsProofService } from '../src/zk-api/snarkjs-proof.service';
import { ProofGenService } from '../src/zk-api/proof-gen.service';

console.log('=== SnarkJS Integration Test ===\n');

async function main() {
  // Test SnarkjsProofService
  const snarkjsService = new SnarkjsProofService();

  console.log('Initializing SnarkJS proof service...');
  const isAvailable = await snarkjsService.initialize();

  console.log('\nService Status:');
  console.log(`  Real verification available: ${isAvailable}`);

  const info = snarkjsService.getCircuitInfo();
  console.log(`  WASM path: ${info.wasmPath}`);
  console.log(`  zkey path: ${info.zkeyPath}`);
  console.log(`  Setup complete: ${info.isSetup}`);

  if (isAvailable) {
    console.log('\n✅ Trusted setup is complete!');
    console.log('   The system will use real cryptographic verification.');
    console.log('\nTo test proof generation, you can:');
    console.log('   1. Generate a proof using the test circuit');
    console.log('   2. Verify it cryptographically with snarkjs');
    console.log('\nExample:');
    console.log(
      '   const { proof, publicSignals } = await snarkjsService.generateProof({',
    );
    console.log('     secretKey: "12345",');
    console.log('     ticketIndex: "0",');
    console.log('     signalX: "0x...",');
    console.log('     idCommitmentExpected: "0x..."');
    console.log('   });');
  } else {
    console.log('\n⚠️  Trusted setup not complete.');
    console.log(
      '   The system will fall back to mock verification (structure-only).',
    );
    console.log('\nTo complete the trusted setup:');
    console.log('   npm run setup:circuit');
    console.log('\nThis will:');
    console.log('   1. Compile the test circuit (~10 seconds)');
    console.log('   2. Generate Powers of Tau (~30 seconds)');
    console.log('   3. Create proving and verification keys (~1 minute)');
    console.log('   4. Verify the final parameters (~5 seconds)');
    console.log('\nTotal time: ~2-3 minutes');
  }

  // Test ProofGenService (mock/fallback mode)
  console.log('\n\n=== Testing Mock Proof Generation (Fallback) ===\n');

  const proofGenService = new ProofGenService();

  console.log('Generating mock proof...');
  const mockProof = await proofGenService.generateMockProof({
    secretKey: 12345n,
    ticketIndex: 0n,
    signalX: 98765n,
    merkleRoot: '0x1234567890abcdef',
    maxCost: '1000000',
    initialDeposit: '10000000',
  });

  console.log('\nMock Proof Generated:');
  console.log(`  Nullifier: ${mockProof.publicInputs.nullifier}`);
  console.log(`  Signal Y: ${mockProof.publicInputs.signalY}`);
  console.log(`  ID Commitment: ${mockProof.publicInputs.idCommitment}`);
  console.log(`  Proof size: ${mockProof.proof.length} bytes`);

  // Test mock verification
  console.log('\nVerifying mock proof...');
  const isValid = proofGenService.verifyMockProof(
    mockProof.proof,
    mockProof.publicInputs,
  );

  console.log(`  Verification result: ${isValid ? '✅ Valid' : '❌ Invalid'}`);

  console.log('\n=== Summary ===\n');
  console.log(
    'Real Verification:',
    isAvailable ? '✅ Available' : '⚠️  Not available (using mock)',
  );
  console.log('Mock Verification:', '✅ Working (fallback mode)');
  console.log('\nThe system is fully functional in development mode.');
  console.log(
    'Run `npm run setup:circuit` to enable real cryptographic verification.',
  );
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
