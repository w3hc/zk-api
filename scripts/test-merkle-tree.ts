#!/usr/bin/env ts-node
/**
 * Test script for Merkle tree proof generation
 * Demonstrates identity commitment insertion and proof generation
 */

const circomlibjs = require('circomlibjs');

// Simplified Merkle tree implementation matching the service
class MerkleTree {
  private poseidon: any;
  private readonly TREE_DEPTH = 20;
  private readonly ZERO_VALUE = BigInt(0);
  private tree: Map<number, Map<number, bigint>> = new Map();
  private zeroHashes: bigint[] = [];
  private leafCount = 0;

  async initialize() {
    this.poseidon = await circomlibjs.buildPoseidon();
    await this.computeZeroHashes();

    for (let i = 0; i <= this.TREE_DEPTH; i++) {
      this.tree.set(i, new Map());
    }
  }

  private async computeZeroHashes() {
    const F = this.poseidon.F;
    this.zeroHashes = [this.ZERO_VALUE];

    for (let i = 1; i <= this.TREE_DEPTH; i++) {
      const prev = this.zeroHashes[i - 1];
      const hash = F.toObject(this.poseidon([prev, prev]));
      this.zeroHashes.push(hash);
    }
  }

  private hash(left: bigint, right: bigint): bigint {
    const F = this.poseidon.F;
    return F.toObject(this.poseidon([left, right]));
  }

  private getNode(level: number, index: number): bigint {
    const levelMap = this.tree.get(level);
    if (!levelMap) {
      return this.zeroHashes[level];
    }
    const node = levelMap.get(index);
    return node !== undefined ? node : this.zeroHashes[level];
  }

  private setNode(level: number, index: number, value: bigint): void {
    let levelMap = this.tree.get(level);
    if (!levelMap) {
      levelMap = new Map();
      this.tree.set(level, levelMap);
    }
    levelMap.set(index, value);
  }

  async insert(idCommitment: bigint): Promise<number> {
    const index = this.leafCount;
    this.leafCount++;

    this.setNode(0, index, idCommitment);

    let currentIndex = index;
    for (let level = 0; level < this.TREE_DEPTH; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      const left = isLeft
        ? this.getNode(level, currentIndex)
        : this.getNode(level, siblingIndex);
      const right = isLeft
        ? this.getNode(level, siblingIndex)
        : this.getNode(level, currentIndex);

      const parentHash = this.hash(left, right);
      const parentIndex = Math.floor(currentIndex / 2);

      this.setNode(level + 1, parentIndex, parentHash);
      currentIndex = parentIndex;
    }

    return index;
  }

  async getRoot(): Promise<bigint> {
    return this.getNode(this.TREE_DEPTH, 0);
  }

  async generateProof(leafIndex: number): Promise<{
    pathElements: bigint[];
    pathIndices: number[];
    leaf: bigint;
    root: bigint;
  }> {
    if (leafIndex >= this.leafCount) {
      throw new Error(`Leaf index ${leafIndex} out of bounds`);
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    const leaf = this.getNode(0, leafIndex);

    let currentIndex = leafIndex;
    for (let level = 0; level < this.TREE_DEPTH; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;
      const sibling = this.getNode(level, siblingIndex);

      pathElements.push(sibling);
      pathIndices.push(isLeft ? 0 : 1);

      currentIndex = Math.floor(currentIndex / 2);
    }

    const root = await this.getRoot();

    return { pathElements, pathIndices, leaf, root };
  }

  async verifyProof(
    leaf: bigint,
    pathElements: bigint[],
    pathIndices: number[],
    root: bigint,
  ): Promise<boolean> {
    let currentHash = leaf;
    for (let i = 0; i < this.TREE_DEPTH; i++) {
      const sibling = pathElements[i];
      const isLeft = pathIndices[i] === 0;

      currentHash = isLeft
        ? this.hash(currentHash, sibling)
        : this.hash(sibling, currentHash);
    }

    return currentHash === root;
  }
}

async function generateIdCommitment(poseidon: any, secretKey: bigint): Promise<bigint> {
  const F = poseidon.F;
  return F.toObject(poseidon([secretKey]));
}

async function main() {
  console.log('🌳 Testing Merkle Tree for Identity Commitments\n');

  // Initialize Poseidon hash
  const poseidon = await circomlibjs.buildPoseidon();

  // Create test users
  const users = [
    { secretKey: BigInt(11111), name: 'Alice' },
    { secretKey: BigInt(22222), name: 'Bob' },
    { secretKey: BigInt(33333), name: 'Charlie' },
    { secretKey: BigInt(44444), name: 'Diana' },
    { secretKey: BigInt(55555), name: 'Eve' },
  ];

  console.log('1️⃣ Generating Identity Commitments...\n');
  const commitments = await Promise.all(
    users.map(async (user) => {
      const commitment = await generateIdCommitment(poseidon, user.secretKey);
      console.log(`  ${user.name}: 0x${commitment.toString(16).slice(0, 16)}...`);
      return { ...user, commitment };
    }),
  );
  console.log();

  console.log('2️⃣ Building Merkle Tree...\n');
  const tree = new MerkleTree();
  await tree.initialize();

  const indices: number[] = [];
  for (const user of commitments) {
    const index = await tree.insert(user.commitment);
    indices.push(index);
    console.log(`  Inserted ${user.name} at index ${index}`);
  }

  const root = await tree.getRoot();
  console.log(`\n  ✅ Merkle Root: 0x${root.toString(16)}\n`);

  console.log('3️⃣ Generating Merkle Proofs...\n');
  for (let i = 0; i < commitments.length; i++) {
    const user = commitments[i];
    const proof = await tree.generateProof(indices[i]);

    console.log(`  ${user.name}:`);
    console.log(`    Leaf: 0x${proof.leaf.toString(16).slice(0, 16)}...`);
    console.log(`    Path depth: ${proof.pathElements.length}`);
    console.log(`    First path element: 0x${proof.pathElements[0].toString(16).slice(0, 16)}...`);
    console.log(`    Path indices: [${proof.pathIndices.slice(0, 5).join(', ')}, ...]`);
    console.log();
  }

  console.log('4️⃣ Verifying Merkle Proofs...\n');
  let allValid = true;
  for (let i = 0; i < commitments.length; i++) {
    const user = commitments[i];
    const proof = await tree.generateProof(indices[i]);

    const isValid = await tree.verifyProof(
      proof.leaf,
      proof.pathElements,
      proof.pathIndices,
      root,
    );

    console.log(`  ${user.name}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    allValid = allValid && isValid;
  }
  console.log();

  console.log('5️⃣ Testing Invalid Proof Detection...\n');

  // Test with wrong leaf
  const alice = commitments[0];
  const aliceProof = await tree.generateProof(indices[0]);
  const wrongLeaf = BigInt(99999);

  const invalidProof1 = await tree.verifyProof(
    wrongLeaf,
    aliceProof.pathElements,
    aliceProof.pathIndices,
    root,
  );
  console.log(`  Wrong leaf: ${invalidProof1 ? '❌ Should be invalid!' : '✅ Correctly rejected'}`);

  // Test with wrong root
  const wrongRoot = BigInt(88888);
  const invalidProof2 = await tree.verifyProof(
    aliceProof.leaf,
    aliceProof.pathElements,
    aliceProof.pathIndices,
    wrongRoot,
  );
  console.log(`  Wrong root: ${invalidProof2 ? '❌ Should be invalid!' : '✅ Correctly rejected'}`);

  // Test with tampered path element
  const tamperedPath = [...aliceProof.pathElements];
  tamperedPath[0] = BigInt(77777);
  const invalidProof3 = await tree.verifyProof(
    aliceProof.leaf,
    tamperedPath,
    aliceProof.pathIndices,
    root,
  );
  console.log(
    `  Tampered path: ${invalidProof3 ? '❌ Should be invalid!' : '✅ Correctly rejected'}`,
  );
  console.log();

  console.log('6️⃣ Generating Circuit Input for Alice...\n');

  // Generate complete circuit input for Alice
  const aliceUser = commitments[0];
  const aliceIndex = indices[0];
  const aliceCircuitProof = await tree.generateProof(aliceIndex);

  const circuitInput = {
    // Private inputs
    secretKey: aliceUser.secretKey.toString(),
    pathElements: aliceCircuitProof.pathElements.map((e) => e.toString()),
    pathIndices: aliceCircuitProof.pathIndices,
    refundValues: Array(100).fill('0'), // Empty refunds for simplicity
    refundSignaturesR8x: Array(100).fill('0'),
    refundSignaturesR8y: Array(100).fill('0'),
    refundSignaturesS: Array(100).fill('0'),
    ticketIndex: '0',
    numRefunds: '0',

    // Public inputs
    merkleRoot: root.toString(),
    maxCost: '1000000000000000', // 0.001 ETH in wei
    initialDeposit: '100000000000000000', // 0.1 ETH in wei
    signalX: '12345', // Random signal
    serverPubKeyX: '0',
    serverPubKeyY: '1',
  };

  console.log('  Circuit Input (sample):');
  console.log(`    secretKey: ${circuitInput.secretKey}`);
  console.log(`    merkleRoot: ${circuitInput.merkleRoot}`);
  console.log(`    pathElements[0]: ${circuitInput.pathElements[0]}`);
  console.log(`    pathIndices[0-4]: [${circuitInput.pathIndices.slice(0, 5).join(', ')}, ...]`);
  console.log(`    ticketIndex: ${circuitInput.ticketIndex}`);
  console.log(`    maxCost: ${circuitInput.maxCost}`);
  console.log();

  if (allValid) {
    console.log('✅ All tests passed! Merkle tree implementation is working correctly.\n');
  } else {
    console.log('❌ Some tests failed!\n');
    process.exit(1);
  }

  console.log('📝 Summary:');
  console.log(`  - Tree depth: 20 (supports up to ${Math.pow(2, 20).toLocaleString()} users)`);
  console.log(`  - Current leaves: ${commitments.length}`);
  console.log(`  - Root: 0x${root.toString(16)}`);
  console.log(`  - All proofs verified successfully ✅`);
  console.log();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
