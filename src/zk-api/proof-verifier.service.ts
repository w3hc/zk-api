/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, Logger } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { ProofGenService } from './proof-gen.service';
import { SnarkjsProofService } from './snarkjs-proof.service';

/**
 * Service for verifying ZK-SNARK proofs using Groth16
 * Now supports real cryptographic verification via snarkjs
 */
@Injectable()
export class ProofVerifierService {
  private readonly logger = new Logger(ProofVerifierService.name);
  private verificationCount = 0;
  private successfulVerifications = 0;
  private failedVerifications = 0;
  private mockVerifications = 0;

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly proofGenService: ProofGenService,
    private readonly snarkjsProofService: SnarkjsProofService,
  ) {}

  /**
   * Check if the service is ready for production use
   * @returns true if real cryptographic verification is available
   */
  isProductionReady(): boolean {
    return this.snarkjsProofService.isAvailable();
  }

  /**
   * Get verification metrics for monitoring
   */
  getMetrics() {
    return {
      total: this.verificationCount,
      successful: this.successfulVerifications,
      failed: this.failedVerifications,
      mock: this.mockVerifications,
      successRate:
        this.verificationCount > 0
          ? (this.successfulVerifications / this.verificationCount) * 100
          : 0,
      usingRealVerification: this.snarkjsProofService.isAvailable(),
    };
  }

  /**
   * Verify a ZK-SNARK proof using Groth16 with cryptographic verification
   * @param proof The proof string to verify
   * @param publicInputs The public inputs that should match the proof
   * @returns Promise<boolean> true if proof is valid, false otherwise
   */
  async verify(
    proof: string,
    publicInputs: {
      merkleRoot: string;
      maxCost: string;
      initialDeposit: string;
      signalX: string;
      nullifier: string;
      signalY: string;
      idCommitment: string;
    },
  ): Promise<boolean> {
    // CRITICAL: Production mode requires real cryptographic verification
    if (
      process.env.NODE_ENV === 'production' &&
      !this.snarkjsProofService.isAvailable()
    ) {
      this.logger.error(
        'CRITICAL: Production mode requires real proof verification. Circuit artifacts not loaded.',
      );
      throw new Error(
        'Proof verification not available in production mode. Configure circuit artifacts.',
      );
    }

    this.logger.debug('Verifying proof with public inputs', {
      nullifier: publicInputs.nullifier.slice(0, 10) + '...',
      maxCost: publicInputs.maxCost,
      idCommitment: publicInputs.idCommitment.slice(0, 10) + '...',
    });

    // 1. Verify proof structure
    if (!proof || proof.length < 10) {
      this.logger.warn('Invalid proof format');
      return false;
    }

    let proofData;
    try {
      proofData = JSON.parse(proof);
    } catch (error) {
      this.logger.error('Failed to parse proof JSON', error);
      return false;
    }

    // Basic structure validation
    if (!proofData.protocol || proofData.protocol !== 'groth16') {
      this.logger.warn('Invalid proof protocol');
      return false;
    }

    if (
      !proofData.pi_a ||
      !proofData.pi_b ||
      !proofData.pi_c ||
      proofData.pi_a.length !== 2 ||
      proofData.pi_b.length !== 2 ||
      proofData.pi_c.length !== 2
    ) {
      this.logger.warn('Invalid proof structure');
      return false;
    }

    this.logger.debug('Proof structure validated');

    // 2. Verify against blockchain state if available
    if (this.blockchainService.isAvailable()) {
      try {
        const onChainMerkleRoot = await this.blockchainService.getMerkleRoot();

        // Check if nullifier has been slashed
        const isSlashed = await this.blockchainService.isNullifierSlashed(
          publicInputs.nullifier,
        );

        if (isSlashed) {
          this.logger.warn(
            `Nullifier ${publicInputs.nullifier} has been slashed`,
          );
          return false;
        }

        // Verify Merkle root matches onchain root
        if (onChainMerkleRoot !== publicInputs.merkleRoot) {
          this.logger.warn('Merkle root mismatch with onchain state', {
            expected: onChainMerkleRoot,
            provided: publicInputs.merkleRoot,
          });
          return false;
        }

        this.logger.debug('Blockchain state verified successfully');
      } catch (error) {
        this.logger.warn('Failed to verify against blockchain state', error);
        // Continue with verification in dev mode
      }
    }

    // 3. Real snarkjs verification (REQUIRED - no mock fallback)
    try {
      this.verificationCount++;

      // CRITICAL: Real cryptographic verification is required
      // The mock fallback has been removed per security audit SEC_AUDIT_JUNE_30.md
      if (!this.snarkjsProofService.isAvailable()) {
        this.failedVerifications++;
        this.logger.error(
          'CRITICAL: Proof verification requires circuit artifacts. ' +
            'Run `npm run setup:circuit` to generate proving/verification keys.',
        );
        throw new Error(
          'Proof verification not available. Circuit artifacts not loaded.',
        );
      }

      this.logger.debug('Using real snarkjs verification');

      // Construct public signals array from public inputs
      // Order must match circuit: public inputs first, then public outputs
      // From api_credit_proof.circom:
      // public inputs: merkleRoot, maxCost, initialDeposit, signalX, serverPubKeyX, serverPubKeyY
      // public outputs: nullifier, signalY, idCommitment
      const publicSignals = [
        publicInputs.merkleRoot.replace('0x', ''),
        publicInputs.maxCost.replace('0x', ''),
        publicInputs.initialDeposit.replace('0x', ''),
        publicInputs.signalX.replace('0x', ''),
        publicInputs.nullifier.replace('0x', ''),
        publicInputs.signalY.replace('0x', ''),
        publicInputs.idCommitment.replace('0x', ''),
      ];

      const isValid = await this.snarkjsProofService.verifyProof(
        proofData,
        publicSignals,
      );

      if (isValid) {
        this.successfulVerifications++;
        this.logger.log('Proof verified successfully (cryptographic)');
      } else {
        this.failedVerifications++;
        this.logger.warn('Proof verification failed (cryptographic)');
      }

      return isValid;
    } catch (error) {
      this.failedVerifications++;
      this.logger.error('Failed to verify proof', error);
      throw error; // Fail closed - don't return false, propagate the error
    }
  }
}
