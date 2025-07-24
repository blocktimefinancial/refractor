#!/usr/bin/env node

const stellarSdk = require("@stellar/stellar-sdk");
const fs = require("fs");
const path = require("path");
// Use built-in fetch in Node.js 18+
const fetch = global.fetch || require("node-fetch");
const { Keypair, TransactionBuilder, Networks, Operation, Asset } = stellarSdk;

// Configuration
const API_BASE_URL = "http://localhost:4010";
const HORIZON_SERVER = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const PAYMENT_AMOUNT = "0.0000001"; // 0.1 stroops for bulk testing
const OPERATIONS_PER_TRANSACTION = 100; // 100 operations per transaction
const KEYPAIRS_COUNT = 10; // Number of keypairs to use

class BulkStellarPaymentTester {
  constructor() {
    this.server = new stellarSdk.Horizon.Server(HORIZON_SERVER);
    this.completedTransactions = 0;
    this.failedTransactions = 0;
    this.totalTransactions = 0;
    this.keypairs = [];
  }

  /**
   * Load keypairs from testkeys.txt file
   */
  loadKeypairs() {
    try {
      const testkeysPath = path.join(__dirname, "../testkeys.txt");
      const content = fs.readFileSync(testkeysPath, "utf8");
      const lines = content.split("\n").filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed &&
          !trimmed.startsWith("//") &&
          !trimmed.startsWith("secretKey") &&
          !trimmed.startsWith("publicKey") &&
          (trimmed.startsWith("G") || trimmed.startsWith("S"))
        ); // Valid Stellar keys
      });

      const keypairs = [];
      for (let i = 0; i < lines.length; i += 2) {
        if (i + 1 < lines.length) {
          const publicKey = lines[i].trim();
          const secretKey = lines[i + 1].trim();
          if (
            publicKey &&
            secretKey &&
            publicKey.startsWith("G") &&
            secretKey.startsWith("S")
          ) {
            keypairs.push({ publicKey, secretKey });
          }
        }
      }

      this.log(`📁 Loaded ${keypairs.length} keypairs from testkeys.txt`);
      return keypairs.slice(0, KEYPAIRS_COUNT); // Limit to desired count
    } catch (error) {
      this.log(`❌ Error loading keypairs: ${error.message}`);
      throw new Error("Failed to load keypairs from testkeys.txt");
    }
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  logProgress() {
    const processed = this.completedTransactions + this.failedTransactions;
    const percentage =
      this.totalTransactions > 0
        ? ((processed / this.totalTransactions) * 100).toFixed(1)
        : 0;

    this.log(
      `📊 Progress: ${processed}/${this.totalTransactions} (${percentage}%) | ✅ ${this.completedTransactions} success | ❌ ${this.failedTransactions} failed`
    );
  }

  async checkAccountExists(publicKey) {
    try {
      const account = await this.server.loadAccount(publicKey);
      return { exists: true, account };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return { exists: false, error: "Account not found" };
      }
      throw error;
    }
  }

  async createAccount(publicKey) {
    this.log(
      `🔧 Creating account ${publicKey.substr(0, 8)}... using Friendbot`
    );
    try {
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
      );

      if (response.ok) {
        this.log(
          `✅ Account ${publicKey.substr(0, 8)}... created successfully`
        );
        // Wait a bit for the account to be available
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return true;
      } else {
        this.log(
          `❌ Failed to create account: ${response.status} ${response.statusText}`
        );
        return false;
      }
    } catch (error) {
      this.log(`❌ Error creating account: ${error.message}`);
      return false;
    }
  }

  async ensureAccountExists(publicKey) {
    const accountCheck = await this.checkAccountExists(publicKey);
    if (!accountCheck.exists) {
      const created = await this.createAccount(publicKey);
      if (!created) {
        throw new Error(`Failed to create account ${publicKey}`);
      }
      // Re-check after creation
      const recheckResult = await this.checkAccountExists(publicKey);
      return recheckResult.account;
    }
    return accountCheck.account;
  }

  async setupTestAccounts() {
    this.log("🏗️  Setting up test accounts...");

    // Load keypairs from testkeys.txt
    this.keypairs = this.loadKeypairs();

    if (this.keypairs.length < 2) {
      throw new Error("Need at least 2 keypairs in testkeys.txt");
    }

    this.log(`🔍 Setting up ${this.keypairs.length} test accounts...`);

    // Ensure all accounts exist and are funded
    for (let i = 0; i < this.keypairs.length; i++) {
      const kp = this.keypairs[i];
      this.log(`🔍 Checking account ${i + 1}: ${kp.publicKey.substr(0, 8)}...`);
      await this.ensureAccountExists(kp.publicKey);
    }

    this.log(`✅ All ${this.keypairs.length} test accounts are ready`);
    this.keypairs.forEach((kp, index) => {
      this.log(`   Account ${index + 1}: ${kp.publicKey.substr(0, 8)}...`);
    });

    return this.keypairs;
  }

  /**
   * Get a random destination keypair different from the source
   */
  getRandomDestination(excludeIndex) {
    const availableIndices = this.keypairs
      .map((_, index) => index)
      .filter((i) => i !== excludeIndex);
    const randomIndex =
      availableIndices[Math.floor(Math.random() * availableIndices.length)];
    return this.keypairs[randomIndex];
  }

  async createBulkPaymentTransaction(sourceKeypairIndex, transactionIndex) {
    const sourceKeypair = this.keypairs[sourceKeypairIndex];
    const globalTxIndex = sourceKeypairIndex * 10 + transactionIndex + 1;

    this.log(
      `🏗️  Creating transaction ${globalTxIndex} from account ${
        sourceKeypairIndex + 1
      } (tx ${transactionIndex + 1}/10)...`
    );

    // Get source account info
    const sourceAccount = await this.server.loadAccount(
      sourceKeypair.publicKey
    );

    // Create transaction builder
    const transactionBuilder = new TransactionBuilder(sourceAccount, {
      fee: (
        Number(stellarSdk.BASE_FEE) *
        (Number(process.env.FEE_MULTIPLIER) || 1000)
      ).toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    // Add operations - randomly choose destination accounts for each operation
    const destinations = [];
    for (let i = 0; i < OPERATIONS_PER_TRANSACTION; i++) {
      const destKeypair = this.getRandomDestination(sourceKeypairIndex);
      destinations.push(destKeypair.publicKey);

      transactionBuilder.addOperation(
        Operation.payment({
          destination: destKeypair.publicKey,
          asset: Asset.native(),
          amount: PAYMENT_AMOUNT,
        })
      );
    }

    // Add memo and build transaction
    const transaction = transactionBuilder
      .addMemo(
        stellarSdk.Memo.text(
          `Bulk #${globalTxIndex} from Acct${sourceKeypairIndex + 1}`
        )
      )
      .setTimeout(300) // 5 minutes timeout
      .build();

    const txHash = transaction.hash().toString("hex");
    const txXDR = transaction.toEnvelope().toXDR("base64");

    // Count unique destinations
    const uniqueDestinations = [...new Set(destinations)];

    this.log(`✅ Transaction ${globalTxIndex} created:`, {
      hash: txHash.substr(0, 16) + "...",
      operations: OPERATIONS_PER_TRANSACTION,
      source: `Account ${
        sourceKeypairIndex + 1
      } (${sourceKeypair.publicKey.substr(0, 8)}...)`,
      destinations: `${uniqueDestinations.length} unique accounts`,
      amount: `${PAYMENT_AMOUNT} XLM per operation`,
      totalAmount: `${(
        parseFloat(PAYMENT_AMOUNT) * OPERATIONS_PER_TRANSACTION
      ).toFixed(7)} XLM total`,
    });

    return { transaction, txHash, txXDR, sourceKeypair };
  }

  async submitToRefractor(txXDR, txHash, submit = true) {
    const payload = {
      hash: txHash,
      network: 1, // 0 = mainnet, 1 = testnet
      xdr: txXDR,
      submit: submit,
      callbackUrl: null,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/tx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      throw new Error(`Failed to submit to Refractor: ${error.message}`);
    }
  }

  async signTransaction(txXDR, sourceKeypair) {
    try {
      const keypair = Keypair.fromSecret(sourceKeypair.secretKey);
      const transaction = new stellarSdk.Transaction(txXDR, NETWORK_PASSPHRASE);

      // Sign the transaction
      transaction.sign(keypair);

      const signedXDR = transaction.toEnvelope().toXDR("base64");
      return signedXDR;
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${error.message}`);
    }
  }

  async retrieveFromRefractor(txHash) {
    try {
      const response = await fetch(`${API_BASE_URL}/tx/${txHash}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      throw new Error(`Failed to retrieve from Refractor: ${error.message}`);
    }
  }

  async waitForProcessing(txHash, maxWaitTime = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const txInfo = await this.retrieveFromRefractor(txHash);

      if (
        txInfo &&
        (txInfo.status === "processed" || txInfo.status === "failed")
      ) {
        return txInfo;
      }

      // Wait 2 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return null; // Timeout
  }

  async verifyOnHorizon(txHash) {
    try {
      const txRecord = await this.server
        .transactions()
        .transaction(txHash)
        .call();

      return txRecord;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async createAndSubmitTransaction(sourceKeypairIndex, transactionIndex) {
    const globalTxIndex = sourceKeypairIndex * 10 + transactionIndex + 1;

    try {
      // Step 1: Create the bulk payment transaction
      const { transaction, txHash, txXDR, sourceKeypair } =
        await this.createBulkPaymentTransaction(
          sourceKeypairIndex,
          transactionIndex
        );

      // Step 2: Sign the transaction
      const signedXDR = await this.signTransaction(txXDR, sourceKeypair);

      // Step 3: Submit signed transaction with submit=true
      this.log(`📤 Submitting transaction ${globalTxIndex}...${txHash}`);
      const result = await this.submitToRefractor(signedXDR, txHash, true);

      this.log(`📤 Transaction ${globalTxIndex} submitted:`, {
        hash: txHash,
        status: result.status,
        source: `Account ${sourceKeypairIndex + 1}`,
      });

      return {
        success: true,
        txHash,
        txNum: globalTxIndex,
        sourceKeypairIndex,
        transactionIndex,
        submittedAt: Date.now(),
      };
    } catch (error) {
      this.log(
        `❌ Transaction ${globalTxIndex} submission failed: ${error.message}`
      );
      return {
        success: false,
        txHash: null,
        txNum: globalTxIndex,
        sourceKeypairIndex,
        transactionIndex,
        error: error.message,
      };
    }
  }

  async pollTransactionStatus(txHash, txNum) {
    try {
      const txInfo = await this.retrieveFromRefractor(txHash);

      if (txInfo) {
        return {
          txHash,
          txNum,
          status: txInfo.status,
          isComplete:
            txInfo.status === "processed" || txInfo.status === "failed",
          txInfo,
        };
      } else {
        return {
          txHash,
          txNum,
          status: "not_found",
          isComplete: false,
          txInfo: null,
        };
      }
    } catch (error) {
      return {
        txHash,
        txNum,
        status: "error",
        isComplete: false,
        error: error.message,
      };
    }
  }

  async pollAllTransactions(submittedTransactions, maxWaitTime = 300000) {
    this.log(
      `🔍 Starting to poll ${submittedTransactions.length} transactions for completion...`
    );
    this.log(`⏰ Maximum wait time: ${maxWaitTime / 1000} seconds`);

    const startTime = Date.now();
    const pendingTransactions = [...submittedTransactions];
    const completedTransactions = [];
    let pollCount = 0;

    while (
      pendingTransactions.length > 0 &&
      Date.now() - startTime < maxWaitTime
    ) {
      pollCount++;
      this.log(
        `\n🔄 Poll #${pollCount} - Checking ${pendingTransactions.length} pending transactions...`
      );

      // Poll all pending transactions
      const pollPromises = pendingTransactions.map((tx) =>
        this.pollTransactionStatus(tx.txHash, tx.txNum)
      );

      const pollResults = await Promise.all(pollPromises);

      // Process poll results
      for (let i = pendingTransactions.length - 1; i >= 0; i--) {
        const result = pollResults[i];

        if (result.isComplete) {
          const tx = pendingTransactions.splice(i, 1)[0];
          completedTransactions.push({ ...tx, finalStatus: result });

          if (result.status === "processed") {
            this.completedTransactions++;
            this.log(`✅ Transaction ${result.txNum} completed successfully!`);
          } else {
            this.failedTransactions++;
            this.log(
              `❌ Transaction ${result.txNum} failed with status: ${result.status}`
            );
          }
        } else {
          this.log(`⏳ Transaction ${result.txNum} still ${result.status}...`);
        }
      }

      this.logProgress();

      // If there are still pending transactions, wait before next poll
      if (pendingTransactions.length > 0) {
        this.log(`⏸️  Waiting 5 seconds before next poll...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Handle any remaining transactions as timeouts
    for (const tx of pendingTransactions) {
      this.failedTransactions++;
      completedTransactions.push({
        ...tx,
        finalStatus: {
          status: "timeout",
          isComplete: true,
          error: "Polling timeout",
        },
      });
      this.log(
        `⏰ Transaction ${tx.txNum} timed out after ${maxWaitTime / 1000}s`
      );
    }

    return completedTransactions;
  }

  async runBulkTest(numberOfTransactions) {
    // Calculate total transactions (10 keypairs * numberOfTransactions each)
    this.totalTransactions = this.keypairs
      ? this.keypairs.length * numberOfTransactions
      : numberOfTransactions;

    this.log(
      "🚀 Starting Multi-Keypair Bulk Stellar Payment Test via Refractor API"
    );
    this.log(`📝 Test Configuration:`);
    this.log(`   - Number of source keypairs: ${KEYPAIRS_COUNT}`);
    this.log(`   - Transactions per keypair: ${numberOfTransactions}`);
    this.log(`   - Total transactions: ${this.totalTransactions}`);
    this.log(`   - Operations per transaction: ${OPERATIONS_PER_TRANSACTION}`);
    this.log(
      `   - Total operations: ${
        this.totalTransactions * OPERATIONS_PER_TRANSACTION
      }`
    );
    this.log(`   - Payment amount: ${PAYMENT_AMOUNT} XLM per operation`);
    this.log(`   - Network: Testnet`);
    this.log("============================================================");

    const startTime = Date.now();

    try {
      // Setup test accounts
      await this.setupTestAccounts();

      // Update total transactions count based on actual keypairs loaded
      this.totalTransactions = this.keypairs.length * numberOfTransactions;

      // Phase 1: Create and submit all transactions from all keypairs
      this.log(
        "\n🚀 Phase 1: Creating and submitting transactions from all keypairs..."
      );
      const submittedTransactions = [];

      for (
        let keypairIndex = 0;
        keypairIndex < this.keypairs.length;
        keypairIndex++
      ) {
        const keypair = this.keypairs[keypairIndex];
        this.log(
          `\n👤 Processing keypair ${keypairIndex + 1}/${
            this.keypairs.length
          }: ${keypair.publicKey.substr(0, 8)}...`
        );

        for (let txIndex = 0; txIndex < numberOfTransactions; txIndex++) {
          const globalTxIndex =
            keypairIndex * numberOfTransactions + txIndex + 1;

          this.log(
            `\n📝 Creating transaction ${globalTxIndex}/${
              this.totalTransactions
            } (Keypair ${keypairIndex + 1}, Tx ${
              txIndex + 1
            }/${numberOfTransactions})...`
          );

          const result = await this.createAndSubmitTransaction(
            keypairIndex,
            txIndex
          );

          if (result.success) {
            submittedTransactions.push(result);
            this.log(`✅ Transaction ${result.txNum} submitted successfully!`);
          } else {
            this.failedTransactions++;
            this.log(
              `❌ Transaction ${globalTxIndex} failed to submit: ${result.error}`
            );
          }

          // Uncomment this to pause, otherwise just jam them in.
          //   // Small delay between submissions to avoid overwhelming the API
          //   if (globalTxIndex < this.totalTransactions) {
          //     await new Promise((resolve) => setTimeout(resolve, 100));
          //   }
        }

        // Uncomment this to pause, otherwise just jam them in.
        // // Longer pause between keypairs to ensure proper sequence number spacing
        // if (keypairIndex < this.keypairs.length - 1) {
        //   this.log(`⏸️  Pausing 2 seconds before next keypair...`);
        //   await new Promise((resolve) => setTimeout(resolve, 2000));
        // }
      }

      this.log(
        `\n📊 Submission Summary: ${submittedTransactions.length}/${this.totalTransactions} transactions submitted successfully`
      );

      // Phase 2: Poll all submitted transactions for completion
      if (submittedTransactions.length > 0) {
        this.log("\n🔍 Phase 2: Polling all transactions for completion...");
        const completedResults = await this.pollAllTransactions(
          submittedTransactions,
          300000 // 5 minute timeout for larger tests
        );

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        // Final summary
        this.log(
          "\n============================================================"
        );
        this.log("🎉 Multi-Keypair Bulk Payment Test Completed!");
        this.log(`📊 Final Results:`);
        this.log(`   - Source keypairs used: ${this.keypairs.length}`);
        this.log(`   - Transactions per keypair: ${numberOfTransactions}`);
        this.log(`   - Total transactions: ${this.totalTransactions}`);
        this.log(`   - Successful: ${this.completedTransactions}`);
        this.log(`   - Failed: ${this.failedTransactions}`);
        this.log(
          `   - Success rate: ${(
            (this.completedTransactions / this.totalTransactions) *
            100
          ).toFixed(1)}%`
        );
        this.log(
          `   - Total operations processed: ${
            this.completedTransactions * OPERATIONS_PER_TRANSACTION
          }`
        );
        this.log(`   - Duration: ${duration.toFixed(1)}s`);
        this.log(
          `   - Average time per transaction: ${(
            duration / this.totalTransactions
          ).toFixed(1)}s`
        );
        this.log(
          `   - Transactions per second: ${(
            this.totalTransactions / duration
          ).toFixed(2)}`
        );
        this.log(
          "============================================================"
        );

        return {
          success: this.completedTransactions > 0,
          totalTransactions: this.totalTransactions,
          completedTransactions: this.completedTransactions,
          failedTransactions: this.failedTransactions,
          duration,
          keypairsUsed: this.keypairs.length,
          transactionsPerKeypair: numberOfTransactions,
          results: completedResults,
        };
      } else {
        // No transactions were submitted successfully
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        this.log(
          "\n============================================================"
        );
        this.log("❌ No transactions were submitted successfully!");
        this.log(`📊 Final Results:`);
        this.log(
          `   - Total transactions attempted: ${this.totalTransactions}`
        );
        this.log(`   - Successful submissions: 0`);
        this.log(`   - Failed submissions: ${this.failedTransactions}`);
        this.log(`   - Duration: ${duration.toFixed(1)}s`);
        this.log(
          "============================================================"
        );

        return {
          success: false,
          totalTransactions: this.totalTransactions,
          completedTransactions: 0,
          failedTransactions: this.failedTransactions,
          duration,
          results: [],
        };
      }
    } catch (error) {
      this.log(`❌ Bulk test failed: ${error.message}`);
      this.log("============================================================");

      return {
        success: false,
        error: error.message,
        completedTransactions: this.completedTransactions,
        failedTransactions: this.failedTransactions,
      };
    }
  }
}

// Main execution
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Bulk Stellar Payment Test Script

This script tests the Refractor API by creating multiple transactions using ${KEYPAIRS_COUNT} different keypairs,
each creating ${OPERATIONS_PER_TRANSACTION} payment operations per transaction, to eliminate sequence number conflicts.

Usage:
  node test-bulk-payments.js <transactions_per_keypair>

Examples:
  node test-bulk-payments.js 5         # Create 5 transactions per keypair (${
    5 * KEYPAIRS_COUNT
  } total transactions, ${
      5 * KEYPAIRS_COUNT * OPERATIONS_PER_TRANSACTION
    } operations)
  node test-bulk-payments.js 10        # Create 10 transactions per keypair (${
    10 * KEYPAIRS_COUNT
  } total transactions, ${
      10 * KEYPAIRS_COUNT * OPERATIONS_PER_TRANSACTION
    } operations)
  node test-bulk-payments.js 20        # Create 20 transactions per keypair (${
    20 * KEYPAIRS_COUNT
  } total transactions, ${
      20 * KEYPAIRS_COUNT * OPERATIONS_PER_TRANSACTION
    } operations)

Configuration:
  - Keypairs used: ${KEYPAIRS_COUNT} (from testkeys.txt)
  - Operations per transaction: ${OPERATIONS_PER_TRANSACTION}
  - Payment amount: ${PAYMENT_AMOUNT} XLM per operation
  - Network: Testnet
  - API endpoint: ${API_BASE_URL}

Features:
  - Multi-keypair approach prevents sequence number conflicts
  - Random destination selection for realistic testing
  - Parallel transaction processing
  - Real-time progress tracking

Requirements:
  - Refractor API running on ${API_BASE_URL}
  - Internet connection for Testnet access
  - All keypairs in testkeys.txt must have sufficient XLM balance
  - testkeys.txt file with at least ${KEYPAIRS_COUNT} keypairs
    `);
    process.exit(0);
  }

  // Get number of transactions per keypair from command line
  const transactionsPerKeypair = parseInt(args[0]);

  if (
    !transactionsPerKeypair ||
    transactionsPerKeypair < 1 ||
    transactionsPerKeypair > 100
  ) {
    console.error(
      "❌ Error: Please specify a valid number of transactions per keypair (1-100)"
    );
    console.error(
      "Usage: node test-bulk-payments.js <transactions_per_keypair>"
    );
    console.error("Example: node test-bulk-payments.js 10");
    process.exit(1);
  }

  // Confirm large operations
  const totalTransactions = transactionsPerKeypair * KEYPAIRS_COUNT;
  const totalOperations = totalTransactions * OPERATIONS_PER_TRANSACTION;

  if (totalOperations > 10000) {
    console.log(
      `⚠️  Warning: You are about to create ${totalOperations} payment operations across ${totalTransactions} transactions`
    );
    console.log(
      `This will require significant XLM balance and processing time.`
    );
  }

  const tester = new BulkStellarPaymentTester();
  const result = await tester.runBulkTest(transactionsPerKeypair);

  if (result.success) {
    console.log("\n✅ Bulk test completed successfully!");
    process.exit(0);
  } else {
    console.log("\n❌ Bulk test failed!");
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

module.exports = BulkStellarPaymentTester;
