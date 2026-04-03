/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-require-imports */

import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Service for real ZK-SNARK proof generation and verification using snarkjs
 *
 * This replaces the mock implementation with cryptographically valid proofs.
 * Requires a completed trusted setup (zkey + verification key).
 */
@Injectable()
export class SnarkjsProofService {
  private readonly logger = new Logger(SnarkjsProofService.name);
  private snarkjs: any;
  private vKey: any;
  private wasmPath: string;
  private zkeyPath: string;
  private isSetup = false;

  constructor() {
    // Paths to production circuit artifacts
    this.wasmPath = join(
      process.cwd(),
      'circuits/build/api_credit_proof_js/api_credit_proof.wasm',
    );
    this.zkeyPath = join(
      process.cwd(),
      'circuits/build/api_credit_proof_final.zkey',
    );
  }

  /**
   * Initialize snarkjs and load verification key
   */
  initialize(): Promise<boolean> {
    if (this.isSetup) {
      return Promise.resolve(true);
    }

    try {
      // Dynamically import snarkjs
      this.snarkjs = require('snarkjs');

      // Check if circuit artifacts exist
      if (!existsSync(this.wasmPath)) {
        this.logger.warn(
          `WASM file not found at ${this.wasmPath}. Using mock proofs.`,
        );
        return Promise.resolve(false);
      }

      if (!existsSync(this.zkeyPath)) {
        this.logger.warn(
          `zkey file not found at ${this.zkeyPath}. Using mock proofs.`,
        );
        return Promise.resolve(false);
      }

      // Load verification key
      const vKeyPath = join(
        process.cwd(),
        'circuits/build/verification_key.json',
      );

      if (!existsSync(vKeyPath)) {
        this.logger.warn(
          `Verification key not found at ${vKeyPath}. Using mock proofs.`,
        );
        return Promise.resolve(false);
      }

      const fs = require('fs');
      const vKeyContent = fs.readFileSync(vKeyPath, 'utf8') as string;
      this.vKey = JSON.parse(vKeyContent);

      this.isSetup = true;
      this.logger.log('SnarkJS proof system initialized successfully');
      return Promise.resolve(true);
    } catch (error) {
      this.logger.error('Failed to initialize snarkjs', error);
      return Promise.resolve(false);
    }
  }

  /**
   * Check if real proof system is available
   */
  isAvailable(): boolean {
    return this.isSetup;
  }

  /**
   * Generate a real ZK-SNARK proof
   *
   * @param input Circuit inputs
   * @returns Proof and public signals
   */
  async generateProof(input: {
    secretKey: string;
    ticketIndex: string;
    signalX: string;
    idCommitmentExpected: string;
  }): Promise<{
    proof: any;
    publicSignals: string[];
  }> {
    if (!this.isSetup) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error(
          'Proof system not initialized. Circuit artifacts missing.',
        );
      }
    }

    try {
      this.logger.debug('Generating witness...');

      // Generate witness
      const { proof, publicSignals } = await this.snarkjs.groth16.fullProve(
        input,
        this.wasmPath,
        this.zkeyPath,
      );

      this.logger.debug('Proof generated successfully', {
        publicSignals: publicSignals.slice(0, 2),
      });

      return { proof, publicSignals };
    } catch (error) {
      this.logger.error('Failed to generate proof', error);
      throw error;
    }
  }

  /**
   * Verify a ZK-SNARK proof
   *
   * @param proof The proof object
   * @param publicSignals Public inputs to verify against
   * @returns true if proof is valid, false otherwise
   */
  async verifyProof(proof: any, publicSignals: string[]): Promise<boolean> {
    if (!this.isSetup) {
      const initialized = await this.initialize();
      if (!initialized) {
        this.logger.warn('Proof system not initialized. Cannot verify proof.');
        return false;
      }
    }

    try {
      const isValid = await this.snarkjs.groth16.verify(
        this.vKey,
        publicSignals,
        proof,
      );

      if (isValid) {
        this.logger.debug('Proof verified successfully');
      } else {
        this.logger.warn('Proof verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying proof', error);
      return false;
    }
  }

  /**
   * Export proof to JSON format for storage/transmission
   */
  exportProof(proof: any): string {
    return JSON.stringify(proof);
  }

  /**
   * Import proof from JSON format
   */
  importProof(proofJson: string): any {
    return JSON.parse(proofJson);
  }

  /**
   * Get circuit information
   */
  getCircuitInfo(): {
    wasmPath: string;
    zkeyPath: string;
    isSetup: boolean;
  } {
    return {
      wasmPath: this.wasmPath,
      zkeyPath: this.zkeyPath,
      isSetup: this.isSetup,
    };
  }
}
