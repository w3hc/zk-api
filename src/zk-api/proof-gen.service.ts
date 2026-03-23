/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-require-imports */

import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';

/**
 * Service for generating ZK proof primitives
 * Uses Poseidon hash and RLN primitives
 * Note: eslint warnings disabled for circomlibjs (no type definitions available)
 */
@Injectable()
export class ProofGenService {
  private readonly logger = new Logger(ProofGenService.name);
  private poseidon: any;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize Poseidon hash (lazy initialization)
   */
  private async initialize() {
    if (this.poseidon) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Use require instead of dynamic import to avoid ESM issues
        const circomlibjs = require('circomlibjs');
        this.poseidon = await circomlibjs.buildPoseidon();
        this.logger.log('Poseidon hash initialized');
      } catch (error) {
        this.logger.error('Failed to initialize Poseidon hash', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Generate identity commitment from secret key
   */
  async generateIdCommitment(secretKey: bigint): Promise<bigint> {
    await this.initialize();
    const F = this.poseidon.F;
    return F.toObject(this.poseidon([secretKey]));
  }

  /**
   * Generate RLN nullifier and signal
   */
  async generateRLNSignal(
    secretKey: bigint,
    ticketIndex: bigint,
    signalX: bigint,
  ): Promise<{
    nullifier: bigint;
    signalY: bigint;
    a: bigint;
  }> {
    await this.initialize();

    const F = this.poseidon.F;

    // a = Hash(secretKey, ticketIndex)
    const a = F.toObject(this.poseidon([secretKey, ticketIndex]));

    // nullifier = Hash(a)
    const nullifier = F.toObject(this.poseidon([a]));

    // signalY = secretKey + a * signalX (using field arithmetic)
    const signalY = F.toObject(
      F.add(F.e(secretKey), F.mul(F.e(a), F.e(signalX))),
    );

    return { nullifier, signalY, a };
  }

  /**
   * Recover secret key from two RLN signals (double-spend detection)
   * Given:
   *   y1 = k + a * x1
   *   y2 = k + a * x2
   * Then:
   *   k = (x2*y1 - x1*y2) / (x2 - x1)
   */
  async recoverSecretKey(
    signal1: { x: bigint; y: bigint },
    signal2: { x: bigint; y: bigint },
  ): Promise<bigint> {
    await this.initialize();

    const F = this.poseidon.F;

    // Ensure signals have different x values
    if (signal1.x === signal2.x) {
      throw new Error('Signals must have different x values');
    }

    // k = (x2*y1 - x1*y2) / (x2 - x1)
    const numerator = F.sub(
      F.mul(F.e(signal2.x), F.e(signal1.y)),
      F.mul(F.e(signal1.x), F.e(signal2.y)),
    );
    const denominator = F.sub(F.e(signal2.x), F.e(signal1.x));
    const secretKey = F.div(numerator, denominator);

    return F.toObject(secretKey);
  }

  /**
   * Generate a mock proof for testing
   * In production, this would use actual ZK-SNARK proof generation
   */
  async generateMockProof(input: {
    secretKey: bigint;
    ticketIndex: bigint;
    signalX: bigint;
    merkleRoot: string;
    maxCost: string;
    initialDeposit: string;
  }): Promise<{
    proof: string;
    publicInputs: {
      merkleRoot: string;
      maxCost: string;
      initialDeposit: string;
      signalX: string;
      nullifier: string;
      signalY: string;
      idCommitment: string;
    };
  }> {
    const idCommitment = await this.generateIdCommitment(input.secretKey);
    const { nullifier, signalY } = await this.generateRLNSignal(
      input.secretKey,
      input.ticketIndex,
      input.signalX,
    );

    // Generate mock proof (hex string)
    const proofData = {
      pi_a: [
        ethers.hexlify(ethers.randomBytes(32)),
        ethers.hexlify(ethers.randomBytes(32)),
      ],
      pi_b: [
        [
          ethers.hexlify(ethers.randomBytes(32)),
          ethers.hexlify(ethers.randomBytes(32)),
        ],
        [
          ethers.hexlify(ethers.randomBytes(32)),
          ethers.hexlify(ethers.randomBytes(32)),
        ],
      ],
      pi_c: [
        ethers.hexlify(ethers.randomBytes(32)),
        ethers.hexlify(ethers.randomBytes(32)),
      ],
      protocol: 'groth16',
    };

    const proof = JSON.stringify(proofData);

    return {
      proof,
      publicInputs: {
        merkleRoot: input.merkleRoot,
        maxCost: input.maxCost,
        initialDeposit: input.initialDeposit,
        signalX: '0x' + input.signalX.toString(16).padStart(64, '0'),
        nullifier: '0x' + nullifier.toString(16).padStart(64, '0'),
        signalY: '0x' + signalY.toString(16).padStart(64, '0'),
        idCommitment: '0x' + idCommitment.toString(16).padStart(64, '0'),
      },
    };
  }

  /**
   * Verify mock proof (basic validation)
   */
  verifyMockProof(
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
  ): boolean {
    try {
      // Parse proof
      const proofData = JSON.parse(proof);

      // Basic validation
      if (proofData.protocol !== 'groth16') {
        return false;
      }

      // Validate structure
      if (
        !proofData.pi_a ||
        !proofData.pi_b ||
        !proofData.pi_c ||
        proofData.pi_a.length !== 2 ||
        proofData.pi_b.length !== 2 ||
        proofData.pi_c.length !== 2
      ) {
        return false;
      }

      // Validate public inputs are hex strings
      const requiredInputs = [
        'merkleRoot',
        'maxCost',
        'initialDeposit',
        'signalX',
        'nullifier',
        'signalY',
        'idCommitment',
      ];

      for (const input of requiredInputs) {
        const key = input as keyof typeof publicInputs;
        if (!publicInputs[key]) {
          return false;
        }
      }

      // In production, this would verify the actual proof using snarkjs
      // For now, we just validate the structure
      this.logger.debug('Mock proof validated successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to verify mock proof', error);
      return false;
    }
  }
}
