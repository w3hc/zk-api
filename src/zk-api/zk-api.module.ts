import { Module } from '@nestjs/common';
import { ZkApiController } from './zk-api.controller';
import { ZkApiService } from './zk-api.service';
import { NullifierStoreService } from './nullifier-store.service';
import { ProofVerifierService } from './proof-verifier.service';
import { EthRateOracleService } from './eth-rate-oracle.service';
import { RefundSignerService } from './refund-signer.service';
import { BlockchainService } from './blockchain.service';
import { ProofGenService } from './proof-gen.service';

@Module({
  controllers: [ZkApiController],
  providers: [
    ZkApiService,
    NullifierStoreService,
    ProofVerifierService,
    ProofGenService,
    EthRateOracleService,
    RefundSignerService,
    BlockchainService,
  ],
  exports: [ZkApiService, ProofGenService],
})
export class ZkApiModule {}
