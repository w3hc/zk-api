import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as ZkApiCreditsABI from './contracts/ZkApiCredits.abi.json';
import { MerkleTreeService } from './merkle-tree.service';

/**
 * Service for interacting with the ZkApiCredits smart contract
 * and maintaining an off-chain Merkle tree for proof generation
 */
@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private contract: ethers.Contract | null = null;
  private wallet: ethers.Wallet | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly merkleTree: MerkleTreeService,
  ) {}

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

      // Sync Merkle tree with on-chain state
      await this.syncMerkleTree();
    } catch (error) {
      this.logger.error('Failed to connect to blockchain', error);
    }
  }

  /**
   * Sync off-chain Merkle tree with on-chain identity commitments
   */
  async syncMerkleTree(): Promise<void> {
    if (!this.contract) {
      this.logger.warn('Cannot sync Merkle tree - blockchain not initialized');
      return;
    }

    try {
      const commitments = await this.getAllIdentityCommitments();
      await this.merkleTree.clear();

      if (commitments.length === 0) {
        this.logger.log('No identity commitments found on-chain');
        return;
      }

      const bigintCommitments = commitments.map((c) => BigInt(c));
      await this.merkleTree.insertBatch(bigintCommitments);

      const offChainRoot = await this.merkleTree.getRoot();
      const onChainRoot = await this.getMerkleRoot();

      this.logger.log(
        `Merkle tree synced: ${commitments.length} commitments loaded`,
      );
      this.logger.debug(`Off-chain root: 0x${offChainRoot.toString(16)}`);
      this.logger.debug(`On-chain root:  ${onChainRoot}`);

      // Verify roots match
      const offChainRootHex =
        '0x' + offChainRoot.toString(16).padStart(64, '0');
      if (offChainRootHex.toLowerCase() !== onChainRoot.toLowerCase()) {
        this.logger.warn(
          'Merkle root mismatch between off-chain and on-chain!',
        );
      }
    } catch (error) {
      this.logger.error('Failed to sync Merkle tree', error);
      throw error;
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
   * Get Merkle proof for an identity commitment
   */
  async getMerkleProof(idCommitment: bigint): Promise<{
    pathElements: string[];
    pathIndices: number[];
    leaf: string;
    root: string;
  }> {
    const leafIndex = await this.merkleTree.findLeafIndex(idCommitment);
    if (leafIndex === -1) {
      throw new Error('Identity commitment not found in Merkle tree');
    }

    const proof = await this.merkleTree.generateProof(leafIndex);

    return {
      pathElements: proof.pathElements.map(
        (e) => '0x' + e.toString(16).padStart(64, '0'),
      ),
      pathIndices: proof.pathIndices,
      leaf: '0x' + proof.leaf.toString(16).padStart(64, '0'),
      root: '0x' + proof.root.toString(16).padStart(64, '0'),
    };
  }

  /**
   * Verify if an identity commitment is a member of the Merkle tree
   */
  async verifyMembership(idCommitment: bigint): Promise<boolean> {
    return await this.merkleTree.isMember(idCommitment);
  }

  /**
   * Get Merkle tree statistics
   */
  async getMerkleTreeStats(): Promise<{
    depth: number;
    leafCount: number;
    capacity: number;
    root: string;
  }> {
    return await this.merkleTree.getStats();
  }

  /**
   * Add identity commitment to off-chain Merkle tree
   * Note: This should be called when monitoring on-chain Deposit events
   */
  async addIdentityCommitment(idCommitment: bigint): Promise<number> {
    const index = await this.merkleTree.insert(idCommitment);
    this.logger.log(
      `Added identity commitment to Merkle tree at index ${index}`,
    );
    return index;
  }

  /**
   * Check if blockchain service is available
   */
  isAvailable(): boolean {
    return this.contract !== null && this.provider !== null;
  }
}
