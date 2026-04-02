import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

// Smart contract ABI for the slashDoubleSpend function
const SLASH_DOUBLE_SPEND_ABI = [
  'function slashDoubleSpend(bytes32 _secretKey, bytes32 _nullifier1, bytes32 _nullifier2, tuple(uint256 x, uint256 y) _signal1, tuple(uint256 x, uint256 y) _signal2) external',
  'event DoubleSpendSlashed(bytes32 indexed secretKey, bytes32 indexed nullifier, address indexed slasher, uint256 reward)',
];

interface RlnSignal {
  x: string;
  y: string;
}

/**
 * Service for submitting slashing transactions to the ZkApiCredits smart contract
 * Handles double-spend detection and on-chain slashing
 */
@Injectable()
export class SlashingService {
  private readonly logger = new Logger(SlashingService.name);
  private readonly provider: ethers.Provider | null;
  private readonly wallet: ethers.Wallet | null;
  private readonly contract: ethers.Contract | null;
  private readonly contractAddress: string | null;

  constructor(private readonly configService: ConfigService) {
    // Get configuration
    const rpcUrl = this.configService.get<string>('ANVIL_RPC_URL');
    const privateKey = this.configService.get<string>('ANVIL_PRIVATE_KEY');
    this.contractAddress =
      this.configService.get<string>('ZK_CONTRACT_ADDRESS') || null;

    // Initialize provider and contract if all config is present
    if (rpcUrl && privateKey && this.contractAddress) {
      try {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.contract = new ethers.Contract(
          this.contractAddress,
          SLASH_DOUBLE_SPEND_ABI,
          this.wallet,
        );
        this.logger.log(
          `SlashingService initialized with contract at ${this.contractAddress}`,
        );
      } catch (error) {
        this.logger.warn(
          'Failed to initialize SlashingService - slashing will be disabled',
          error,
        );
        this.provider = null;
        this.wallet = null;
        this.contract = null;
      }
    } else {
      this.logger.warn(
        'SlashingService not configured - missing ANVIL_RPC_URL, ANVIL_PRIVATE_KEY, or ZK_CONTRACT_ADDRESS. Slashing will be disabled.',
      );
      this.provider = null;
      this.wallet = null;
      this.contract = null;
    }
  }

  /**
   * Check if slashing is enabled (contract is configured)
   */
  isEnabled(): boolean {
    return this.contract !== null;
  }

  /**
   * Submit a slashing transaction for double-spend
   * @param secretKey The extracted secret key (0x-prefixed hex string)
   * @param nullifier The nullifier used in both signals
   * @param signal1 First RLN signal
   * @param signal2 Second RLN signal
   * @returns Transaction hash if successful
   */
  async slashDoubleSpend(
    secretKey: string,
    nullifier: string,
    signal1: RlnSignal,
    signal2: RlnSignal,
  ): Promise<string | null> {
    if (!this.contract) {
      this.logger.warn(
        'Slashing transaction skipped - contract not configured',
      );
      return null;
    }

    try {
      this.logger.log(
        `Submitting slashing transaction for secret key: ${secretKey.slice(0, 10)}...`,
      );

      // Convert signals to the format expected by the contract
      const signal1Struct = {
        x: BigInt(signal1.x),
        y: BigInt(signal1.y),
      };
      const signal2Struct = {
        x: BigInt(signal2.x),
        y: BigInt(signal2.y),
      };

      // Submit transaction
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const tx = await this.contract.slashDoubleSpend(
        secretKey,
        nullifier,
        nullifier, // Same nullifier for both
        signal1Struct,
        signal2Struct,
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const txHash = tx.hash as string;
      this.logger.log(`Slashing transaction submitted: ${txHash}`);

      // Wait for confirmation
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const receipt = await tx.wait();

      this.logger.log(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Slashing transaction confirmed in block ${receipt?.blockNumber || 'unknown'}`,
      );

      // Parse event logs to get reward amount
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (receipt && receipt.logs) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const event = receipt.logs
          .map((log: { topics: string[]; data: string }) => {
            try {
              return this.contract!.interface.parseLog({
                topics: log.topics,
                data: log.data,
              });
            } catch {
              return null;
            }
          })
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          .find(
            (parsedLog: { name?: string } | null) =>
              parsedLog?.name === 'DoubleSpendSlashed',
          );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (event && event.args) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const reward = event.args.reward;
          this.logger.log(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            `Double-spend slashing successful! Reward: ${ethers.formatEther(reward)} ETH`,
          );
        }
      }

      return txHash;
    } catch (error) {
      this.logger.error('Failed to submit slashing transaction', error);
      throw new Error('Slashing transaction failed', { cause: error });
    }
  }

  /**
   * Get the contract address being used
   */
  getContractAddress(): string | null {
    return this.contractAddress || null;
  }

  /**
   * Get the wallet address being used for slashing
   */
  getSlasherAddress(): string | null {
    return this.wallet?.address || null;
  }
}
