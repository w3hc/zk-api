#!/usr/bin/env node
/**
 * Test the exact same proof that the API receives
 * This helps debug differences between standalone and API verification
 */

const snarkjs = require('snarkjs');
const fs = require('fs');

async function main() {
  console.log('🔍 Testing exact proof verification\n');

  // Use the exact same proof from generate-proof.ts output
  const proof = {
    pi_a: [
      "515687079971798123278459600368466667318046707583408732063981114913586217752",
      "10233021175401039053331828665225968836329463554950883019700061684773475076428",
      "1"
    ],
    pi_b: [
      [
        "19447759505940061687958733956092247888170031397935667183182139614845102701204",
        "204920839539756892210957636747700417814062857368287805058408542196462147490",
        "1"
      ],
      [
        "17239501478970770590047954353131063341104065446443931053671243820349059128412",
        "17181302172468946828574489144038079077716578527106899190769799160244154369862",
        "1"
      ]
    ],
    pi_c: [
      "20328687091071242978394310488753003611831000631364163111445662200636039484723",
      "109231480021366002261628593778825448116036535015920047077898188793539851364",
      "1"
    ],
    protocol: "groth16"
  };

  // Public signals in circom order: [nullifier, signalY, idCommitment, signalX, idCommitmentExpected]
  const publicSignals = [
    "11042460056127931613669913619327853197862917926154399113046092869773516761767", // nullifier
    "1087049085995155035236645975062971592817287734918704675752309984451130194012", // signalY
    "4267533774488295900887461483015112262021273608761099826938271132511348470966", // idCommitment
    "649452507357", // signalX
    "4267533774488295900887461483015112262021273608761099826938271132511348470966", // idCommitmentExpected
  ];

  console.log('Public signals:');
  console.log('  nullifier:', publicSignals[0]);
  console.log('  signalY:', publicSignals[1]);
  console.log('  idCommitment:', publicSignals[2]);
  console.log('  signalX:', publicSignals[3]);
  console.log('  idCommitmentExpected:', publicSignals[4]);
  console.log();

  // Load verification key
  const vKey = JSON.parse(
    fs.readFileSync('circuits/build/verification_key.json', 'utf-8')
  );

  console.log('Verification key loaded:');
  console.log('  gamma[0][0]:', vKey.vk_gamma_2[0][0].substring(0, 20) + '...');
  console.log('  delta[0][0]:', vKey.vk_delta_2[0][0].substring(0, 20) + '...');
  console.log();

  // Convert proof from API format (with z coordinates) to snarkjs format
  // snarkjs.groth16.verify expects affine coordinates [x, y] without z
  const snarkjsProof = {
    pi_a: [proof.pi_a[0], proof.pi_a[1]],
    pi_b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]], // Note: reversed order
      [proof.pi_b[1][1], proof.pi_b[1][0]]
    ],
    pi_c: [proof.pi_c[0], proof.pi_c[1]],
    protocol: 'groth16',
    curve: 'bn128'
  };

  console.log('Verifying proof...');
  const isValid = await snarkjs.groth16.verify(vKey, publicSignals, snarkjsProof);

  if (isValid) {
    console.log('✅ PROOF VALID\n');
  } else {
    console.log('❌ PROOF INVALID\n');

    // Try with different signal orders to debug
    console.log('Testing alternative signal orders...\n');

    const alt1 = [
      publicSignals[3], // signalX
      publicSignals[4], // idCommitmentExpected
      publicSignals[0], // nullifier
      publicSignals[1], // signalY
      publicSignals[2], // idCommitment
    ];

    const isValid1 = await snarkjs.groth16.verify(vKey, alt1, snarkjsProof);
    console.log('Alternative 1 (inputs first, outputs last):', isValid1 ? '✅' : '❌');
  }

  process.exit(isValid ? 0 : 1);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
