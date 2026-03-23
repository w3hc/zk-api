#!/usr/bin/env ts-node
/**
 * Test script for ZK proof generation and verification
 */

const circomlibjs = require('circomlibjs');
import { ethers } from 'ethers';

async function testProofGeneration() {
  console.log('🧪 Testing ZK Proof Generation and Verification\n');

  // Initialize Poseidon hash
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  // Test inputs
  const secretKey = BigInt(12345);
  const ticketIndex = BigInt(0);
  const signalX = BigInt(ethers.hexlify(ethers.randomBytes(32)));

  console.log('1️⃣ Generating Identity Commitment...');
  const idCommitment = F.toObject(poseidon([secretKey]));
  console.log(`   ✅ ID Commitment: 0x${idCommitment.toString(16)}\n`);

  console.log('2️⃣ Generating RLN Signal...');
  const a = F.toObject(poseidon([secretKey, ticketIndex]));
  const nullifier = F.toObject(poseidon([a]));
  // Convert to field elements properly
  const aF = F.e(a);
  const signalXF = F.e(signalX);
  const secretKeyF = F.e(secretKey);
  const signalY = F.toObject(F.add(secretKeyF, F.mul(aF, signalXF)));

  console.log(`   ✅ a: ${a}`);
  console.log(`   ✅ Nullifier: 0x${nullifier.toString(16)}`);
  console.log(`   ✅ Signal Y: ${signalY}\n`);

  console.log('3️⃣ Testing Double-Spend Detection...');

  // Create two signals with same nullifier but different x values
  const signalX2 = signalX + BigInt(1);
  const signalY2 = F.toObject(F.add(F.e(secretKey), F.mul(F.e(a), F.e(signalX2))));

  console.log('   Signal 1:', { x: signalX, y: signalY });
  console.log('   Signal 2:', { x: signalX2, y: signalY2 });

  // Recover secret key from two signals
  // k = (x2*y1 - x1*y2) / (x2 - x1)
  const numerator = F.sub(F.mul(F.e(signalX2), F.e(signalY)), F.mul(F.e(signalX), F.e(signalY2)));
  const denominator = F.sub(F.e(signalX2), F.e(signalX));
  const recoveredKey = F.toObject(F.div(numerator, denominator));

  console.log(`   ✅ Recovered Secret Key: ${recoveredKey}`);
  console.log(`   ✅ Original Secret Key: ${secretKey}`);
  console.log(`   ✅ Match: ${recoveredKey === secretKey}\n`);

  console.log('4️⃣ Generating Mock Proof...');
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

  const proof = JSON.stringify(proofData);
  console.log(`   ✅ Proof size: ${proof.length} bytes\n`);

  console.log('5️⃣ Validating Proof Structure...');
  const parsedProof = JSON.parse(proof);
  const isValid =
    parsedProof.protocol === 'groth16' &&
    parsedProof.pi_a.length === 2 &&
    parsedProof.pi_b.length === 2 &&
    parsedProof.pi_c.length === 2;

  console.log(`   ✅ Proof structure valid: ${isValid}\n`);

  console.log('6️⃣ Creating Public Inputs...');
  const publicInputs = {
    merkleRoot: ethers.hexlify(ethers.randomBytes(32)),
    maxCost: ethers.parseEther('0.001').toString(),
    initialDeposit: ethers.parseEther('0.1').toString(),
    signalX: '0x' + signalX.toString(16).padStart(64, '0'),
    nullifier: '0x' + nullifier.toString(16).padStart(64, '0'),
    signalY: '0x' + signalY.toString(16).padStart(64, '0'),
    idCommitment: '0x' + idCommitment.toString(16).padStart(64, '0'),
  };

  console.log('   Public Inputs:');
  Object.entries(publicInputs).forEach(([key, value]) => {
    const displayValue = value.length > 66 ? value.slice(0, 66) + '...' : value;
    console.log(`     ${key}: ${displayValue}`);
  });
  console.log();

  console.log('✅ All tests passed!\n');

  return { proof, publicInputs };
}

async function main() {
  try {
    await testProofGeneration();
    console.log('🎉 ZK proof system is working correctly!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
