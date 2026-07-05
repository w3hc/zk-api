#!/usr/bin/env ts-node
/**
 * Generate ML-KEM-1024 keypair for admin encryption/decryption
 * This script generates quantum-resistant keypairs that should be stored in .env
 *
 * Usage: pnpm ts-node scripts/generate-admin-keypair.ts
 */

import { createMlKem1024 } from 'mlkem';

async function generateKeypair() {
  console.log('🔐 Generating ML-KEM-1024 keypair (quantum-resistant)...\n');

  // Create ML-KEM-1024 instance
  const mlkem = await createMlKem1024();

  // Generate keypair
  const [publicKey, privateKey] = mlkem.generateKeyPair();

  // Convert to base64 for storage
  const publicKeyBase64 = Buffer.from(publicKey).toString('base64');
  const privateKeyBase64 = Buffer.from(privateKey).toString('base64');

  console.log('✅ Keypair generated successfully!\n');
  console.log('📋 Add these to your .env file:\n');
  console.log('# ML-KEM-1024 Admin Keypair (quantum-resistant encryption)');
  console.log(`ADMIN_MLKEM_PUBLIC_KEY=${publicKeyBase64}`);
  console.log(`ADMIN_MLKEM_PRIVATE_KEY=${privateKeyBase64}`);
  console.log('\n⚠️  IMPORTANT:');
  console.log('- Keep the private key SECRET and secure');
  console.log('- The public key will be exposed in attestation responses');
  console.log('- Clients will encrypt secrets with the public key');
  console.log('- Only the TEE can decrypt with the private key');
  console.log('\n🔒 Security:');
  console.log('- ML-KEM-1024: NIST FIPS 203 standard');
  console.log('- Quantum-resistant (post-quantum cryptography)');
  console.log('- 1568 bytes public key, 3168 bytes private key');
  console.log('- Security level: NIST Level 5 (256-bit classical security)');
}

generateKeypair().catch((err) => {
  console.error('❌ Error generating keypair:', err);
  process.exit(1);
});
