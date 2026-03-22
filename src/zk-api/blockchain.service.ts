import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as ZkApiCreditsABI from './contracts/ZkApiCredits.abi.json';

/**
 * Service for interacting with the ZkApiCredits smart contract
 */
@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private contract: ethers.Contract | null = null;
  private wallet: ethers.Wallet | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const rpcUrl = this.configService.get<string>('ANVIL_RPC_URL');
    const contractAddress = this.configService.get<string>(
      'ZK_CONTRACT_ADDRESS',
    );
    const privateKey = this.configService.get<string>('ANVIL_PRIVATE_KEY');

    if (!rpcUrl || !contractAddress) {
      this.logger.warn(
        'Blockchain configuration not found. Contract interaction will be disabled.',
      );
      return;
    }

    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.contract = new ethers.Contract(
        contractAddress,
        ZkApiCreditsABI,
        this.provider,
      );

      if (privateKey) {
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.contract = this.contract.connect(this.wallet) as ethers.Contract;
      }

      // Test connection
      const merkleRoot = (await this.contract.merkleRoot()) as string;
      this.logger.log(
        `Connected to ZkApiCredits at ${contractAddress}. Merkle root: ${merkleRoot}`,
      );
    } catch (error) {
      this.logger.error('Failed to connect to blockchain', error);
    }
  }

  /**
   * Get the current Merkle root from the contract
   */
  async getMerkleRoot(): Promise<string> {
    if (!this.contract) {
      throw new Error('Blockchain service not initialized');
    }

    return (await this.contract.merkleRoot()) as string;
  }

  /**
   * Check if an identity commitment has an active deposit
   */
  async hasActiveDeposit(idCommitment: string): Promise<boolean> {
    if (!this.contract) {
      throw new Error('Blockchain service not initialized');
    }

    const deposit = (await this.contract.getDeposit(idCommitment)) as {
      active: boolean;
    };
    return deposit.active;
  }

  /**
   * Get deposit details for an identity commitment
   */
  async getDeposit(idCommitment: string): Promise<{
    idCommitment: string;
    rlnStake: bigint;
    policyStake: bigint;
    timestamp: bigint;
    active: boolean;
  }> {
    if (!this.contract) {
      throw new Error('Blockchain service not initialized');
    }

    return (await this.contract.getDeposit(idCommitment)) as {
      idCommitment: string;
      rlnStake: bigint;
      policyStake: bigint;
      timestamp: bigint;
      active: boolean;
    };
  }

  /**
   * Get all identity commitments (for building Merkle tree)
   */
  async getAllIdentityCommitments(): Promise<string[]> {
    if (!this.contract) {
      throw new Error('Blockchain service not initialized');
    }

    return (await this.contract.getAllIdentityCommitments()) as string[];
  }

  /**
   * Get the size of the anonymity set
   */
  async getAnonymitySetSize(): Promise<number> {
    if (!this.contract) {
      throw new Error('Blockchain service not initialized');
    }

    const size = (await this.contract.getAnonymitySetSize()) as bigint;
    return Number(size);
  }

  /**
   * Check if a nullifier has been slashed
   */
  async isNullifierSlashed(nullifier: string): Promise<boolean> {
    if (!this.contract) {
      throw new Error('Blockchain service not initialized');
    }

    return (await this.contract.slashedNullifiers(nullifier)) as boolean;
  }

  /**
   * Get server address from contract
   */
  async getServerAddress(): Promise<string> {
    if (!this.contract) {
      throw new Error('Blockchain service not initialized');
    }

    return (await this.contract.serverAddress()) as string;
  }

  /**
   * Get minimum stake requirements
   */
  async getMinStakes(): Promise<{
    minRlnStake: bigint;
    minPolicyStake: bigint;
  }> {
    if (!this.contract) {
      throw new Error('Blockchain service not initialized');
    }

    const minRlnStake = (await this.contract.minRlnStake()) as bigint;
    const minPolicyStake = (await this.contract.minPolicyStake()) as bigint;

    return { minRlnStake, minPolicyStake };
  }

  /**
   * Check if blockchain service is available
   */
  isAvailable(): boolean {
    return this.contract !== null && this.provider !== null;
  }
}
