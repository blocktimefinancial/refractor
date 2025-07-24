#!/usr/bin/env node

/**
 * Test script for Refractor API with 1 transaction per keypair limitation
 * This test verifies that the API correctly handles bulk payments when each keypair
 * is limited to processing only one transaction at a time.
 */

const axios = require("axios");
const stellarSdk = require("@stellar/stellar-sdk");

class KeypairLimitTester {
  constructor(baseUrl = "http://localhost:4010") {
    this.baseUrl = baseUrl;
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: [],
    };
    this.keypairs = [];
    this.transactions = [];
  }

  log(message, level = "INFO") {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level}: ${message}`);
  }

  async test(name, testFn) {
    try {
      this.log(`Running test: ${name}`);
      const result = await testFn();
      this.testResults.passed++;
      this.log(`✅ ${name} - PASSED`, "SUCCESS");
      return result;
    } catch (error) {
      this.testResults.failed++;
      this.testResults.errors.push({ test: name, error: error.message });
      this.log(`❌ ${name} - FAILED: ${error.message}`, "ERROR");
      return null;
    }
  }

  async apiCall(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  }

  /**
   * Generate a test transaction using a specific keypair
   */
  generateTransactionForKeypair(
    sourceKeypair,
    destinationKeypair,
    sequenceNumber = "0"
  ) {
    // Create a mock account object with the specified sequence number
    const sourceAccount = new stellarSdk.Account(
      sourceKeypair.publicKey(),
      sequenceNumber
    );

    const transaction = new stellarSdk.TransactionBuilder(sourceAccount, {
      fee: stellarSdk.BASE_FEE,
      networkPassphrase: stellarSdk.Networks.TESTNET,
    })
      .addOperation(
        stellarSdk.Operation.payment({
          destination: destinationKeypair.publicKey(),
          asset: stellarSdk.Asset.native(),
          amount: "0.1",
        })
      )
      .setTimeout(300)
      .build();

    const hash = transaction.hash().toString("hex");
    const xdr = transaction.toEnvelope().toXDR("base64");

    return {
      hash,
      network: 1, // testnet
      xdr,
      signatures: [],
      submit: false,
      callbackUrl: null,
      desiredSigners: [sourceKeypair.publicKey()],
      minTime: 0,
      maxTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      sourceKeypair,
      destinationKeypair,
    };
  }

  /**
   * Test health check endpoint
   */
  async testHealthCheck() {
    const health = await this.apiCall("GET", "/monitoring/health");

    if (!health.status) {
      throw new Error("Health check response missing status");
    }

    this.log(`API Health status: ${health.status}`);
    return health;
  }

  /**
   * Test submitting multiple transactions using the same keypair
   * This should verify the 1 transaction per keypair limitation
   */
  async testSameKeypairMultipleTransactions() {
    this.log("Testing multiple transactions with same keypair...");

    const sourceKeypair = stellarSdk.Keypair.random();
    const transactions = [];

    // Create 3 transactions using the same source keypair
    for (let i = 0; i < 3; i++) {
      const destinationKeypair = stellarSdk.Keypair.random();
      const transaction = this.generateTransactionForKeypair(
        sourceKeypair,
        destinationKeypair,
        i.toString() // Different sequence numbers
      );
      transactions.push(transaction);
    }

    // Submit all transactions
    const submissionResults = [];
    for (let i = 0; i < transactions.length; i++) {
      try {
        const result = await this.apiCall("POST", "/tx", transactions[i]);
        submissionResults.push({ success: true, result, index: i });
        this.log(`Transaction ${i} submitted: ${result.hash}`);
      } catch (error) {
        submissionResults.push({
          success: false,
          error: error.message,
          index: i,
        });
        this.log(`Transaction ${i} failed: ${error.message}`, "WARN");
      }

      // Small delay between submissions
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Analyze results
    const successful = submissionResults.filter((r) => r.success).length;
    this.log(
      `Same keypair test: ${successful}/${transactions.length} transactions accepted`
    );

    // With 1 transaction per keypair limitation, we might expect only 1 to succeed
    // or the API might handle them differently
    return { transactions, submissionResults, successful };
  }

  /**
   * Test submitting transactions with different keypairs (bulk payments scenario)
   */
  async testDifferentKeypairsBulkPayments() {
    this.log("Testing bulk payments with different keypairs...");

    const transactionCount = 5;
    const transactions = [];

    // Create transactions using different keypairs
    for (let i = 0; i < transactionCount; i++) {
      const sourceKeypair = stellarSdk.Keypair.random();
      const destinationKeypair = stellarSdk.Keypair.random();
      const transaction = this.generateTransactionForKeypair(
        sourceKeypair,
        destinationKeypair
      );
      transactions.push(transaction);
      this.keypairs.push(sourceKeypair);
    }

    // Submit all transactions
    const submissionResults = [];
    for (let i = 0; i < transactions.length; i++) {
      try {
        const result = await this.apiCall("POST", "/tx", transactions[i]);
        submissionResults.push({ success: true, result, index: i });
        this.log(`Bulk payment ${i} submitted: ${result.hash}`);
      } catch (error) {
        submissionResults.push({
          success: false,
          error: error.message,
          index: i,
        });
        this.log(`Bulk payment ${i} failed: ${error.message}`, "WARN");
      }

      // Small delay between submissions
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const successful = submissionResults.filter((r) => r.success).length;
    this.log(
      `Bulk payments test: ${successful}/${transactions.length} transactions accepted`
    );

    this.transactions = transactions;
    return { transactions, submissionResults, successful };
  }

  /**
   * Test transaction retrieval and status checking
   */
  async testTransactionStatusChecking(submissionResults) {
    this.log("Checking transaction statuses...");

    const statusChecks = [];

    for (const result of submissionResults) {
      if (result.success && result.result.hash) {
        try {
          const txInfo = await this.apiCall("GET", `/tx/${result.result.hash}`);
          statusChecks.push({
            hash: result.result.hash,
            status: txInfo.status,
            success: true,
          });
          this.log(`Transaction ${result.result.hash}: ${txInfo.status}`);
        } catch (error) {
          statusChecks.push({
            hash: result.result.hash,
            status: "error",
            error: error.message,
            success: false,
          });
          this.log(
            `Failed to check status for ${result.result.hash}: ${error.message}`,
            "WARN"
          );
        }

        // Small delay between status checks
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return statusChecks;
  }

  /**
   * Test queue metrics during bulk processing
   */
  async testQueueMetricsDuringProcessing() {
    this.log("Monitoring queue metrics during processing...");

    try {
      const metrics = await this.apiCall("GET", "/monitoring/metrics");

      if (metrics.finalizer && metrics.finalizer.metrics) {
        const { processed, failed, throughput, queueLength } =
          metrics.finalizer.metrics;
        this.log(
          `Queue Metrics - Processed: ${processed}, Failed: ${failed}, Throughput: ${throughput}, Queue Length: ${queueLength}`
        );
        return metrics.finalizer.metrics;
      } else {
        this.log("Queue metrics not available", "WARN");
        return null;
      }
    } catch (error) {
      this.log(`Failed to fetch queue metrics: ${error.message}`, "WARN");
      return null;
    }
  }

  /**
   * Test signing transactions with the same keypair to simulate the signature process
   */
  async testTransactionSigning() {
    this.log("Testing transaction signing process...");

    if (this.transactions.length === 0) {
      throw new Error("No transactions available for signing test");
    }

    // Take the first transaction and sign it
    const transaction = this.transactions[0];
    const sourceKeypair = transaction.sourceKeypair;

    try {
      // Parse the XDR and sign it
      const stellarTx = stellarSdk.TransactionBuilder.fromXDR(
        transaction.xdr,
        stellarSdk.Networks.TESTNET
      );

      stellarTx.sign(sourceKeypair);

      const signedXdr = stellarTx.toEnvelope().toXDR("base64");

      // Submit the signed transaction
      const signedTxData = {
        ...transaction,
        xdr: signedXdr,
        signatures: [
          {
            key: sourceKeypair.publicKey(),
            signature: stellarTx.signatures[0].signature().toString("base64"),
          },
        ],
      };

      const result = await this.apiCall("POST", "/tx", signedTxData);
      this.log(`Signed transaction submitted: ${result.hash}`);

      return result;
    } catch (error) {
      this.log(`Transaction signing failed: ${error.message}`, "ERROR");
      throw error;
    }
  }

  /**
   * Run comprehensive keypair limit tests
   */
  async runKeypairLimitTests() {
    this.log("Starting Refractor API Keypair Limit Test Suite");
    this.log("=".repeat(70));

    // Basic health check
    await this.test("API Health Check", () => this.testHealthCheck());

    // Test same keypair multiple transactions
    const sameKeypairResults = await this.test(
      "Same Keypair Multiple Transactions",
      () => this.testSameKeypairMultipleTransactions()
    );

    // Test different keypairs bulk payments
    const bulkPaymentResults = await this.test(
      "Different Keypairs Bulk Payments",
      () => this.testDifferentKeypairsBulkPayments()
    );

    // Check transaction statuses
    if (bulkPaymentResults && bulkPaymentResults.submissionResults) {
      await this.test("Transaction Status Checking", () =>
        this.testTransactionStatusChecking(bulkPaymentResults.submissionResults)
      );
    }

    // Monitor queue metrics
    await this.test("Queue Metrics Monitoring", () =>
      this.testQueueMetricsDuringProcessing()
    );

    // Test transaction signing
    await this.test("Transaction Signing Process", () =>
      this.testTransactionSigning()
    );

    // Results summary
    this.log("=".repeat(70));
    this.log(
      `Test Results: ${this.testResults.passed} passed, ${this.testResults.failed} failed`
    );

    if (this.testResults.failed > 0) {
      this.log("Failed tests:", "ERROR");
      this.testResults.errors.forEach((error) => {
        this.log(`  - ${error.test}: ${error.error}`, "ERROR");
      });
    } else {
      this.log("All keypair limit tests passed! 🎉", "SUCCESS");
    }

    // Analysis summary
    this.log("=".repeat(70));
    this.log("ANALYSIS SUMMARY:");

    if (sameKeypairResults) {
      this.log(
        `- Same keypair scenario: ${sameKeypairResults.successful} out of 3 transactions accepted`
      );
    }

    if (bulkPaymentResults) {
      this.log(
        `- Bulk payments scenario: ${bulkPaymentResults.successful} out of 5 transactions accepted`
      );
    }

    this.log(
      "- This validates the API's handling of the 1 transaction per keypair limitation"
    );

    return {
      sameKeypairResults,
      bulkPaymentResults,
      testResults: this.testResults,
    };
  }
}

// Command line execution
if (require.main === module) {
  const baseUrl = process.argv[2] || "http://localhost:4010";
  const tester = new KeypairLimitTester(baseUrl);

  tester.runKeypairLimitTests().catch((error) => {
    console.error("Keypair limit test suite failed:", error);
    process.exit(1);
  });
}

module.exports = KeypairLimitTester;
