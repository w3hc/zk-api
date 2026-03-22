# ZK API Client Example

This document provides example client code for interacting with the ZK API Credits system.

## Installation

```bash
npm install ethers @noble/curves circomlibjs
```

## Client Implementation

```typescript
import { ethers } from 'ethers';
import { poseidon } from 'circomlibjs';
import { generateProof } from './zkProver'; // Your ZK proof generator

interface RefundTicket {
  nullifier: string;
  value: string;
  timestamp: number;
  signature: {
    R8x: string;
    R8y: string;
    S: string;
  };
}

class ZkApiClient {
  private secretKey: bigint;
  private idCommitment: string;
  private ticketIndex: number = 0;
  private refundTickets: RefundTicket[] = [];
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  private apiUrl: string;

  constructor(
    apiUrl: string,
    contractAddress: string,
    providerUrl: string,
  ) {
    this.apiUrl = apiUrl;
    this.provider = new ethers.JsonRpcProvider(providerUrl);
    this.contract = new ethers.Contract(
      contractAddress,
      ZK_API_CREDITS_ABI,
      this.provider,
    );

    // Generate or load secret key
    this.secretKey = this.loadOrGenerateSecretKey();
    this.idCommitment = this.computeIdCommitment(this.secretKey);
  }

  /**
   * Step 1: Deposit ETH to the contract
   */
  async deposit(amountETH: string, signer: ethers.Signer): Promise<void> {
    console.log('Depositing', amountETH, 'ETH...');

    const tx = await this.contract.connect(signer).deposit(this.idCommitment, {
      value: ethers.parseEther(amountETH),
    });

    await tx.wait();
    console.log('Deposit successful! Transaction:', tx.hash);
    console.log('Your identity commitment:', this.idCommitment);
  }

  /**
   * Step 2: Send anonymous API request
   */
  async sendPrompt(
    prompt: string,
    maxCostETH: string,
    model?: string,
  ): Promise<{
    response: string;
    actualCost: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    console.log('Preparing ZK proof...');

    // 1. Get Merkle proof from contract
    const merkleProof = await this.getMerkleProof();

    // 2. Get server public key
    const serverPubKey = await this.getServerPublicKey();

    // 3. Generate ZK proof
    const proof = await this.generateZkProof({
      secretKey: this.secretKey,
      merkleProof,
      refundTickets: this.refundTickets,
      ticketIndex: this.ticketIndex,
      maxCost: ethers.parseEther(maxCostETH),
      serverPubKey,
    });

    // 4. Compute RLN signal
    const { nullifier, signal } = await this.computeRlnSignal(prompt);

    // 5. Send request to API
    console.log('Sending request to API...');
    const response = await fetch(`${this.apiUrl}/zk-api/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: prompt,
        nullifier,
        signal,
        proof,
        maxCost: ethers.parseEther(maxCostETH).toString(),
        model,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${error}`);
    }

    const result = await response.json();

    // 6. Store refund ticket for next request
    this.refundTickets.push(result.refundTicket);
    this.ticketIndex++;

    console.log('Request successful!');
    console.log('Cost:', ethers.formatEther(result.actualCost), 'ETH');
    console.log('Refund:', ethers.formatEther(result.refundTicket.value), 'ETH');

    return {
      response: result.response,
      actualCost: result.actualCost,
      usage: result.usage,
    };
  }

  /**
   * Step 3: Withdraw unused funds
   */
  async withdraw(recipient: string, signer: ethers.Signer): Promise<void> {
    console.log('Withdrawing funds to', recipient);

    // Calculate total available balance
    const deposit = await this.contract.getDeposit(this.idCommitment);
    const totalBalance = deposit.rlnStake + deposit.policyStake;

    const tx = await this.contract
      .connect(signer)
      .withdraw(this.idCommitment, recipient, this.secretKey);

    await tx.wait();
    console.log('Withdrawal successful!');
    console.log('Amount:', ethers.formatEther(totalBalance), 'ETH');
  }

  // ============ Private Methods ============

  private loadOrGenerateSecretKey(): bigint {
    // In production, load from secure storage or generate new key
    const stored = localStorage.getItem('zkapi_secret_key');
    if (stored) {
      return BigInt(stored);
    }

    // Generate random secret key
    const randomBytes = ethers.randomBytes(32);
    const secretKey = BigInt(ethers.hexlify(randomBytes));

    // Store securely (in production, use encrypted storage)
    localStorage.setItem('zkapi_secret_key', secretKey.toString());

    return secretKey;
  }

  private computeIdCommitment(secretKey: bigint): string {
    // ID = Hash(secretKey)
    return ethers.keccak256(ethers.toBeHex(secretKey, 32));
  }

  private async getMerkleProof(): Promise<{
    pathElements: string[];
    pathIndices: number[];
  }> {
    const [indices, siblings] = await this.contract.getMerkleProof(
      this.idCommitment,
    );

    return {
      pathElements: siblings,
      pathIndices: indices.map((i: bigint) => Number(i)),
    };
  }

  private async getServerPublicKey(): Promise<{ x: string; y: string }> {
    const response = await fetch(`${this.apiUrl}/zk-api/server-pubkey`);
    return response.json();
  }

  private async computeRlnSignal(payload: string): Promise<{
    nullifier: string;
    signal: { x: string; y: string };
  }> {
    // RLN computation
    // a = Hash(secretKey, ticketIndex)
    const a = BigInt(
      ethers.keccak256(
        ethers.solidityPacked(
          ['uint256', 'uint256'],
          [this.secretKey, this.ticketIndex],
        ),
      ),
    );

    // nullifier = Hash(a)
    const nullifier = ethers.keccak256(ethers.toBeHex(a, 32));

    // x = Hash(payload)
    const x = BigInt(ethers.keccak256(ethers.toUtf8Bytes(payload)));

    // y = secretKey + a * x
    const y = this.secretKey + a * x;

    return {
      nullifier,
      signal: {
        x: '0x' + x.toString(16),
        y: '0x' + y.toString(16),
      },
    };
  }

  private async generateZkProof(input: any): Promise<string> {
    // This would use the actual ZK proof generation library
    // For now, return a placeholder
    // TODO: Implement with snarkjs or similar

    console.log('Generating ZK proof with input:', {
      ticketIndex: input.ticketIndex,
      numRefunds: this.refundTickets.length,
    });

    // In production:
    // const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    //   input,
    //   'api_credit_proof.wasm',
    //   'api_credit_proof_final.zkey'
    // );
    // return ethers.hexlify(proof);

    return '0xdeadbeef'; // Placeholder
  }
}

// ============ Example ABI ============

const ZK_API_CREDITS_ABI = [
  'function deposit(bytes32 _idCommitment) external payable',
  'function withdraw(bytes32 _idCommitment, address payable _recipient, bytes32 _secretKey) external',
  'function getMerkleProof(bytes32 _idCommitment) external view returns (uint256[] memory indices, bytes32[] memory siblings)',
  'function getDeposit(bytes32 _idCommitment) external view returns (tuple(bytes32 idCommitment, uint256 rlnStake, uint256 policyStake, uint256 timestamp, bool active))',
];

// ============ Usage Example ============

async function main() {
  const client = new ZkApiClient(
    'https://api.example.com', // API URL
    '0x1234...', // Contract address
    'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY', // Provider URL
  );

  // Connect wallet
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  // 1. Deposit funds (one-time)
  await client.deposit('0.01', signer);

  // 2. Make anonymous API requests
  const result1 = await client.sendPrompt(
    'What is quantum computing?',
    '0.001', // Max cost
    'claude-sonnet-4.6',
  );
  console.log('Claude response:', result1.response);

  const result2 = await client.sendPrompt(
    'Explain blockchain in simple terms',
    '0.001',
  );
  console.log('Claude response:', result2.response);

  // 3. Withdraw remaining funds (optional)
  // await client.withdraw(await signer.getAddress(), signer);
}

// Run
main().catch(console.error);
```

## Browser Integration Example

```html
<!DOCTYPE html>
<html>
  <head>
    <title>ZK API Client</title>
    <script src="https://cdn.jsdelivr.net/npm/ethers@6/dist/ethers.umd.min.js"></script>
  </head>
  <body>
    <h1>Anonymous Claude API</h1>

    <div id="status">Connecting wallet...</div>

    <button id="depositBtn">Deposit 0.01 ETH</button>
    <br /><br />

    <textarea id="prompt" rows="4" cols="50" placeholder="Enter your prompt..."></textarea>
    <br />
    <button id="submitBtn">Send Anonymous Request</button>

    <div id="response"></div>

    <script>
      const client = new ZkApiClient(
        'http://localhost:3000',
        '0xYourContractAddress',
        'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
      );

      let signer;

      async function init() {
        const provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        document.getElementById('status').textContent = 'Connected: ' + (await signer.getAddress());
      }

      document.getElementById('depositBtn').onclick = async () => {
        await client.deposit('0.01', signer);
        alert('Deposit successful!');
      };

      document.getElementById('submitBtn').onclick = async () => {
        const prompt = document.getElementById('prompt').value;
        const result = await client.sendPrompt(prompt, '0.001');
        document.getElementById('response').textContent = result.response;
      };

      init();
    </script>
  </body>
</html>
```

## Security Best Practices

1. **Secret Key Storage**
   - Use encrypted local storage or hardware wallets
   - Never expose secret key in logs or network requests
   - Consider key derivation from user passphrase

2. **Refund Ticket Management**
   - Verify server signatures before using tickets
   - Store tickets securely (encrypted IndexedDB)
   - Back up tickets to prevent loss

3. **Proof Generation**
   - Generate proofs client-side to maintain privacy
   - Use WebAssembly for performance
   - Cache Merkle proofs to reduce contract calls

4. **Network Security**
   - Always use HTTPS
   - Consider using Tor or VPN for additional privacy
   - Verify TLS certificates

## Troubleshooting

### "Invalid ZK proof"
- Ensure circuit is compiled correctly
- Check that public inputs match proof
- Verify Merkle proof is up to date

### "Nullifier already used"
- Check ticket index hasn't been reused
- Ensure no concurrent requests with same index
- Increment ticket index after each successful request

### "Double-spend detected"
- **Critical**: Your secret key has been revealed
- Withdraw remaining funds immediately
- Generate new secret key and re-deposit

## License

GPL-3.0
