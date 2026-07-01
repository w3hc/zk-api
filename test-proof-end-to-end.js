const snarkjs = require('snarkjs');
const fs = require('fs');
const circomlibjs = require('circomlibjs');

async function test() {
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  // Generate inputs
  const secretKey = BigInt(99999);
  const ticketIndex = BigInt(5);
  const idCommitment = F.toObject(poseidon([secretKey]));
  const signalX = BigInt(123456);

  const input = {
    secretKey: secretKey.toString(),
    ticketIndex: ticketIndex.toString(),
    signalX: signalX.toString(),
    idCommitmentExpected: idCommitment.toString()
  };

  console.log('Input:', input);
  console.log('\nGenerating proof...');

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    'circuits/build/api_credit_proof_test_js/api_credit_proof_test.wasm',
    'circuits/build/api_credit_proof_test.zkey'
  );

  console.log('Public signals:', publicSignals);

  const vKey = JSON.parse(fs.readFileSync('circuits/build/verification_key.json', 'utf-8'));

  console.log('\nVerifying proof...');
  const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

  console.log('\nResult:', isValid ? '✅ PROOF VALID - Everything working!' : '❌ PROOF INVALID - Something wrong');

  if (!isValid) {
    console.log('\nDiagnostics:');
    console.log('VKey gamma:', vKey.vk_gamma_2[0][0].substring(0, 30) + '...');
    console.log('VKey delta:', vKey.vk_delta_2[0][0].substring(0, 30) + '...');
  }

  process.exit(isValid ? 0 : 1);
}

test().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
