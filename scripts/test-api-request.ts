#!/usr/bin/env ts-node
/**
 * Complete end-to-end test: Generate ZK proof and make API request
 */

const circomlibjs = require('circomlibjs');
import { ethers } from 'ethers';

async function generateProofAndRequest() {
  console.log('🧪 Generating ZK Proof and Testing API\n');

  // Initialize Poseidon hash
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  // Test inputs
  const secretKey = BigInt(12345);
  const ticketIndex = BigInt(0);
  const signalX = BigInt(ethers.hexlify(ethers.randomBytes(32)));

  // Generate identity commitment
  const idCommitment = F.toObject(poseidon([secretKey]));

  // Generate RLN signal
  const a = F.toObject(poseidon([secretKey, ticketIndex]));
  const nullifier = F.toObject(poseidon([a]));
  const signalY = F.toObject(F.add(F.e(secretKey), F.mul(F.e(a), F.e(signalX))));

  console.log('Generated proof components:');
  console.log(`  Nullifier: 0x${nullifier.toString(16)}`);
  console.log(`  Signal X: ${signalX}`);
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

  const proof = JSON.stringify(proofData);

  // Prepare API request
  const apiRequest = {
    payload: "What does 苟全性命於亂世，不求聞達於諸侯。mean?",
    nullifier: '0x' + nullifier.toString(16).padStart(64, '0'),
    signal: {
      x: signalX.toString(),
      y: signalY.toString(),
    },
    proof: proof,
    maxCost: ethers.parseEther('0.001').toString(),
  };

  console.log('📤 Making API request...');
  console.log(JSON.stringify(apiRequest, null, 2));
  console.log();

  // Make the API request
  const apiUrl = process.env.API_URL || 'https://localhost:3000';

  try {
    const https = require('https');
    const agent = new https.Agent({
      rejectUnauthorized: false // For self-signed certificates in dev
    });

    const response = await fetch(`${apiUrl}/zk-api/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiRequest),
      // @ts-ignore
      agent: agent,
    });

    console.log(`📥 Response Status: ${response.status}`);

    const responseData = await response.json();
    console.log('📥 Response Body:');
    console.log(JSON.stringify(responseData, null, 2));

    if (response.ok) {
      console.log('\n✅ API request successful!');
    } else {
      console.log('\n⚠️ API request failed');
    }

    return responseData;
  } catch (error) {
    console.error('❌ Request failed:', error);
    throw error;
  }
}

async function main() {
  try {
    await generateProofAndRequest();
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
