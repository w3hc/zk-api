import { Module } from '@nestjs/common';
import { ZkApiController } from './zk-api.controller';
import { ZkApiService } from './zk-api.service';
import { NullifierStoreService } from './nullifier-store.service';
import { ProofVerifierService } from './proof-verifier.service';
import { EthRateOracleService } from './eth-rate-oracle.service';
import { RefundSignerService } from './refund-signer.service';
import { BlockchainService } from './blockchain.service';
import { ProofGenService } from './proof-gen.service';
import { MerkleTreeService } from './merkle-tree.service';
import { SnarkjsProofService } from './snarkjs-proof.service';
import { SecretsService } from '../config/secrets.service';
import { TeePlatformService } from '../attestation/tee-platform.service';

@Module({
  controllers: [ZkApiController],
  providers: [
    ZkApiService,
    NullifierStoreService,
    ProofVerifierService,
    ProofGenService,
    SnarkjsProofService,
    EthRateOracleService,
    RefundSignerService,
    BlockchainService,
    MerkleTreeService,
    SecretsService,
    TeePlatformService,
  ],
  exports: [
    ZkApiService,
    ProofGenService,
    BlockchainService,
    MerkleTreeService,
  ],
})
export class ZkApiModule {}
