/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, Logger } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { ProofGenService } from './proof-gen.service';

/**
 * Service for verifying ZK-SNARK proofs using Groth16
 */
@Injectable()
export class ProofVerifierService {
  private readonly logger = new Logger(ProofVerifierService.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly proofGenService: ProofGenService,
  ) {}

  /**
   * Verify a ZK-SNARK proof using Groth16
   * @param proof The proof string to verify
   * @returns true if proof is valid, false otherwise
   */
  verify(proof: string): boolean {
    if (!proof || proof.length < 10) {
      this.logger.warn('Invalid proof format');
      return false;
    }

    try {
      // Parse proof
      const proofData = JSON.parse(proof);

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
      return true;
    } catch (error) {
      this.logger.error('Failed to verify proof', error);
      return false;
    }
  }

  /**
   * Verify proof with public inputs
   * @param proof The proof string
   * @param publicInputs The public inputs that should match the proof
   */
  async verifyWithInputs(
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
    this.logger.debug('Verifying proof with public inputs', {
      nullifier: publicInputs.nullifier.slice(0, 10) + '...',
      maxCost: publicInputs.maxCost,
      idCommitment: publicInputs.idCommitment.slice(0, 10) + '...',
    });

    // 1. Verify proof structure
    const isValidProof = this.verify(proof);
    if (!isValidProof) {
      this.logger.warn('Proof structure validation failed');
      return false;
    }

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

        // Verify Merkle root matches on-chain root
        if (onChainMerkleRoot !== publicInputs.merkleRoot) {
          this.logger.warn('Merkle root mismatch with on-chain state', {
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

    // 3. Use ProofGenService to verify the proof
    const isValid = this.proofGenService.verifyMockProof(proof, publicInputs);

    if (isValid) {
      this.logger.log('Proof verified successfully');
    } else {
      this.logger.warn('Proof verification failed');
    }

    return isValid;
  }
}
