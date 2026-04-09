#!/usr/bin/env ts-node

/**
 * Test script for ZK proof generation
 *
 * This script demonstrates generating proofs for:
 * 1. Withdrawal
 * 2. Refund redemption
 * 3. Double-spend slashing
 */

import { ProofGenService } from '../src/zk-api/proof-gen.service';
import { Logger } from '@nestjs/common';

const logger = new Logger('TestProofGeneration');

async function main() {
  logger.log('🔧 Initializing ProofGenService...');
  const proofGenService = new ProofGenService();

  // Test parameters
  const secretKey = BigInt('12345678901234567890');
  const ticketIndex = BigInt(1);
  const signalX = BigInt('999888777666555444');

  logger.log('\n📊 Test Parameters:');
  logger.log(`  Secret Key: ${secretKey}`);
  logger.log(`  Ticket Index: ${ticketIndex}`);
  logger.log(`  Signal X: ${signalX}`);

  // Generate identity commitment
  logger.log('\n🔑 Generating identity commitment...');
  const idCommitment = await proofGenService.generateIdCommitment(secretKey);
  logger.log(`  ID Commitment: 0x${idCommitment.toString(16)}`);

  // Generate RLN signal
  logger.log('\n🔒 Generating RLN signal...');
  const { nullifier, signalY, a } = await proofGenService.generateRLNSignal(
    secretKey,
    ticketIndex,
    signalX,
  );
  logger.log(`  Nullifier: 0x${nullifier.toString(16)}`);
  logger.log(`  Signal Y: 0x${signalY.toString(16)}`);
  logger.log(`  a (intermediate): 0x${a.toString(16)}`);

  // Test 1: Generate withdrawal proof
  logger.log('\n\n=== TEST 1: Withdrawal Proof ===');
  try {
    logger.log('Generating withdrawal proof...');
    const withdrawalProof = await proofGenService.generateWithdrawalProof({
      secretKey,
      ticketIndex,
      signalX,
    });

    logger.log('✅ Withdrawal proof generated successfully!');
    logger.log(`  Proof elements: ${withdrawalProof.proof.length}`);
    logger.log(`  Public signals: ${withdrawalProof.publicSignals.length}`);
    logger.log('\n  Proof (first 2 elements):');
    logger.log(`    pA[0]: 0x${BigInt(withdrawalProof.proof[0]).toString(16).slice(0, 16)}...`);
    logger.log(`    pA[1]: 0x${BigInt(withdrawalProof.proof[1]).toString(16).slice(0, 16)}...`);
    logger.log('\n  Public Signals:');
    withdrawalProof.publicSignals.forEach((s, i) => {
      logger.log(`    [${i}]: 0x${BigInt(s).toString(16)}`);
    });
  } catch (error: any) {
    logger.error('❌ Withdrawal proof generation failed:', error.message);
  }

  // Test 2: Generate refund proof
  logger.log('\n\n=== TEST 2: Refund Redemption Proof ===');
  try {
    logger.log('Generating refund proof...');
    const refundProof = await proofGenService.generateRefundRedemptionProof({
      secretKey,
      ticketIndex,
      signalX,
    });

    logger.log('✅ Refund proof generated successfully!');
    logger.log(`  Proof elements: ${refundProof.proof.length}`);
    logger.log(`  Public signals: ${refundProof.publicSignals.length}`);
    logger.log('\n  Proof (first 2 elements):');
    logger.log(`    pA[0]: 0x${BigInt(refundProof.proof[0]).toString(16).slice(0, 16)}...`);
    logger.log(`    pA[1]: 0x${BigInt(refundProof.proof[1]).toString(16).slice(0, 16)}...`);
    logger.log('\n  Public Signals:');
    refundProof.publicSignals.forEach((s, i) => {
      logger.log(`    [${i}]: 0x${BigInt(s).toString(16)}`);
    });
  } catch (error: any) {
    logger.error('❌ Refund proof generation failed:', error.message);
  }

  // Test 3: Generate double-spend slashing proof
  logger.log('\n\n=== TEST 3: Double-Spend Slashing Proof ===');
  try {
    // Create two different signals with the same nullifier
    const signalX1 = BigInt('111111111111111111');
    const signalX2 = BigInt('222222222222222222');

    const { signalY: signalY1 } = await proofGenService.generateRLNSignal(
      secretKey,
      ticketIndex,
      signalX1,
    );
    const { signalY: signalY2 } = await proofGenService.generateRLNSignal(
      secretKey,
      ticketIndex,
      signalX2,
    );

    logger.log('Generated two signals for double-spend:');
    logger.log(`  Signal 1: (x: 0x${signalX1.toString(16)}, y: 0x${signalY1.toString(16).slice(0, 16)}...)`);
    logger.log(`  Signal 2: (x: 0x${signalX2.toString(16)}, y: 0x${signalY2.toString(16).slice(0, 16)}...)`);

    // Recover secret key to verify
    const recoveredKey = await proofGenService.recoverSecretKey(
      { x: signalX1, y: signalY1 },
      { x: signalX2, y: signalY2 },
    );
    logger.log(`  Recovered secret key: 0x${recoveredKey.toString(16)}`);
    logger.log(`  Matches original: ${recoveredKey === secretKey ? '✅ YES' : '❌ NO'}`);

    logger.log('\nGenerating slashing proof...');
    const slashingProof = await proofGenService.generateDoubleSpendProof({
      secretKey,
      ticketIndex,
      signal1: { x: signalX1, y: signalY1 },
      signal2: { x: signalX2, y: signalY2 },
    });

    logger.log('✅ Slashing proof generated successfully!');
    logger.log(`  Proof elements: ${slashingProof.proof.length}`);
    logger.log(`  Public signals: ${slashingProof.publicSignals.length}`);
    logger.log('\n  Proof (first 2 elements):');
    logger.log(`    pA[0]: 0x${BigInt(slashingProof.proof[0]).toString(16).slice(0, 16)}...`);
    logger.log(`    pA[1]: 0x${BigInt(slashingProof.proof[1]).toString(16).slice(0, 16)}...`);
    logger.log('\n  Public Signals:');
    slashingProof.publicSignals.forEach((s, i) => {
      logger.log(`    [${i}]: 0x${BigInt(s).toString(16)}`);
    });
  } catch (error: any) {
    logger.error('❌ Slashing proof generation failed:', error.message);
  }

  logger.log('\n\n✨ All proof generation tests completed!');
  logger.log('\n📝 Summary:');
  logger.log('  - Withdrawal proofs can be used in contract.withdraw()');
  logger.log('  - Refund proofs can be used in contract.redeemRefund()');
  logger.log('  - Slashing proofs can be used in contract.slashDoubleSpend()');
  logger.log('\n💡 Next steps:');
  logger.log('  1. Use these proofs with the ZkApiCredits contract');
  logger.log('  2. Integrate with frontend for user-friendly proof generation');
  logger.log('  3. Add proof caching for better performance');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
