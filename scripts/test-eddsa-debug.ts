// @ts-ignore
import { buildBabyjub, buildEddsa, buildPoseidon } from 'circomlibjs';

async function main() {
  const eddsa = await buildEddsa();
  const babyJub = await buildBabyjub();
  const poseidon = await buildPoseidon();

  // Use the dev private key from refund-signer.service.ts
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update('zk-api-refund-signer-dev-key');
  const privateKeyHex = '0x' + hash.digest('hex');
  const privateKey = Buffer.from(privateKeyHex.replace(/^0x/, '').padStart(64, '0'), 'hex');

  // Get public key
  const pubKey = eddsa.prv2pub(privateKey);
  const pubKeyX = '0x' + String(babyJub.F.toString(pubKey[0], 16)).padStart(64, '0');
  const pubKeyY = '0x' + String(babyJub.F.toString(pubKey[1], 16)).padStart(64, '0');

  console.log('Server Public Key:');
  console.log('  x:', pubKeyX);
  console.log('  y:', pubKeyY);
  console.log('');

  // Test data
  const nullifier = BigInt('0x2ebcdcfa43945cdb0722382d6eb63f8068b8bcf5ac358e13f2a6b2c75f971473');
  const value = BigInt('998775379525626');
  const timestamp = BigInt('1775629597512');

  // Compute message hash
  const messageHash = poseidon([nullifier, value, timestamp]);
  const message = poseidon.F.toObject(messageHash);
  console.log('Message Hash:', '0x' + message.toString(16).padStart(64, '0'));
  console.log('');

  // Sign
  const signature = eddsa.signPoseidon(privateKey, babyJub.F.e(message));
  const R8x = '0x' + String(babyJub.F.toString(signature.R8[0], 16)).padStart(64, '0');
  const R8y = '0x' + String(babyJub.F.toString(signature.R8[1], 16)).padStart(64, '0');
  const S = '0x' + String(signature.S.toString(16)).padStart(64, '0');

  console.log('Signature:');
  console.log('  R8x:', R8x);
  console.log('  R8y:', R8y);
  console.log('  S:', S);
  console.log('');

  // Verify with circomlib
  const verified = eddsa.verifyPoseidon(
    babyJub.F.e(message),
    signature,
    pubKey
  );
  console.log('circomlib verification:', verified ? '✓ PASS' : '✗ FAIL');
  console.log('');

  // Show the hash used in EdDSA verification
  const h = poseidon([signature.R8[0], signature.R8[1], pubKey[0], pubKey[1], babyJub.F.e(message)]);
  const hValue = poseidon.F.toObject(h);
  console.log('EdDSA Hash H(R, A, M):', '0x' + hValue.toString(16).padStart(64, '0'));
  console.log('');

  // Compute what Solidity will compute
  console.log('=== Solidity Verification Steps ===');
  console.log('1. Message hash:', '0x' + message.toString(16).padStart(64, '0'));
  console.log('2. H = Poseidon([R8x, R8y, Ax, Ay, M])');
  console.log('   - R8x:', R8x);
  console.log('   - R8y:', R8y);
  console.log('   - Ax:', pubKeyX);
  console.log('   - Ay:', pubKeyY);
  console.log('   - M:', '0x' + message.toString(16).padStart(64, '0'));
  console.log('   - H:', '0x' + hValue.toString(16).padStart(64, '0'));
  console.log('3. Verify: S*B = R + (H*8)*A');
  console.log('   - S:', S);
}

main().catch(console.error);
