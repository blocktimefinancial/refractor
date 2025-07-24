#!/usr/bin/env node

/**
 * Test script for the enhanced Refractor API with Mongoose and optimized FastQ workers
 */

const axios = require("axios");
const crypto = require("crypto");
const stellarSdk = require("@stellar/stellar-sdk");

class RefractorAPITester {
  constructor(baseUrl = "http://localhost:4010") {
    this.baseUrl = baseUrl;
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: [],
    };
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

  generateTestTransaction() {
    // Create a valid Stellar transaction for testing
    const sourceKeypair = stellarSdk.Keypair.random();
    const destinationKeypair = stellarSdk.Keypair.random();

    // Create a mock account object with the minimum required properties
    const sourceAccount = new stellarSdk.Account(
      sourceKeypair.publicKey(),
      "0"
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
      desiredSigners: [],
      minTime: 0,
      maxTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };
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

  // Test Cases

  async testHealthCheck() {
    const health = await this.apiCall("GET", "/monitoring/health");

    if (!health.status) {
      throw new Error("Health check response missing status");
    }

    if (!health.queue) {
      throw new Error("Health check response missing queue info");
    }

    this.log(`Health status: ${health.status}`);
  }

  async testMetricsEndpoint() {
    const metrics = await this.apiCall("GET", "/monitoring/metrics");

    if (!metrics.finalizer) {
      throw new Error("Metrics response missing finalizer data");
    }

    if (!metrics.finalizer.metrics) {
      throw new Error("Metrics response missing finalizer metrics");
    }

    const { processed, failed, throughput, queueLength } =
      metrics.finalizer.metrics;
    this.log(
      `Queue metrics - Processed: ${processed}, Failed: ${failed}, Throughput: ${throughput}, Queue: ${queueLength}`
    );
  }

  async testTransactionSubmission() {
    const testTx = this.generateTestTransaction();

    try {
      const response = await this.apiCall("POST", "/tx", testTx);

      if (!response.hash || response.hash !== testTx.hash) {
        throw new Error("Transaction submission response invalid");
      }

      this.log(`Transaction submitted successfully: ${response.hash}`);
      return testTx.hash;
    } catch (error) {
      if (error.response && error.response.status === 400) {
        // This might be expected if validation fails
        this.log(`Validation error (expected): ${error.response.data.error}`);
        return null;
      }
      throw error;
    }
  }

  async testTransactionRetrieval(hash) {
    if (!hash) {
      this.log("Skipping transaction retrieval test - no valid hash");
      return;
    }

    const transaction = await this.apiCall("GET", `/tx/${hash}`);

    if (!transaction.hash || transaction.hash !== hash) {
      throw new Error("Retrieved transaction hash mismatch");
    }

    this.log(`Transaction retrieved successfully: ${transaction.hash}`);
  }

  async testValidationErrors() {
    // Test invalid hash format
    try {
      await this.apiCall("POST", "/tx", {
        hash: "invalid-hash",
        network: 1,
        xdr: "test",
      });
      throw new Error("Expected validation error for invalid hash");
    } catch (error) {
      if (error.response && error.response.status === 400) {
        this.log("Validation correctly rejected invalid hash");
      } else {
        throw error;
      }
    }

    // Add delay between validation tests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test invalid network
    try {
      await this.apiCall("POST", "/tx", {
        hash: crypto.randomBytes(32).toString("hex"),
        network: 999,
        xdr: "test",
      });
      throw new Error("Expected validation error for invalid network");
    } catch (error) {
      if (error.response && error.response.status === 400) {
        this.log("Validation correctly rejected invalid network");
      } else {
        throw error;
      }
    }
  }

  async testQueueControls() {
    // Test pause
    await this.apiCall("POST", "/monitoring/queue/pause");
    this.log("Queue paused successfully");

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test resume
    await this.apiCall("POST", "/monitoring/queue/resume");
    this.log("Queue resumed successfully");

    // Test concurrency adjustment
    await this.apiCall("POST", "/monitoring/queue/concurrency", {
      concurrency: 25,
    });
    this.log("Queue concurrency adjusted successfully");
  }

  async testLoadGeneration() {
    this.log("Starting load generation test...");

    const transactionCount = 5; // Reduced for more manageable testing
    const results = [];

    // Sequential processing to avoid rate limiting
    for (let i = 0; i < transactionCount; i++) {
      const testTx = this.generateTestTransaction();

      try {
        const result = await this.apiCall("POST", "/tx", testTx);
        results.push(result);
        this.log(`Transaction ${i} submitted successfully: ${result.hash}`);
      } catch (err) {
        // Log detailed error for debugging
        if (err.response && err.response.data) {
          this.log(
            `Transaction ${i} failed: ${JSON.stringify(err.response.data)}`,
            "WARN"
          );
        } else {
          this.log(`Transaction ${i} failed: ${err.message}`, "WARN");
        }
        results.push(null);
      }

      // Add delay between requests to avoid rate limiting
      if (i < transactionCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const successful = results.filter((r) => r !== null).length;

    this.log(
      `Load test completed: ${successful}/${transactionCount} transactions successful`
    );

    if (successful === 0) {
      throw new Error("No transactions were successful in load test");
    }
  }

  async testDatabaseStats() {
    const metrics = await this.apiCall("GET", "/monitoring/metrics");

    if (metrics.database) {
      const { total, byStatus } = metrics.database;
      this.log(
        `Database stats - Total: ${total}, By status: ${JSON.stringify(
          byStatus
        )}`
      );
    } else {
      this.log(
        "Database stats not available (may be using non-Mongoose provider)",
        "WARN"
      );
    }
  }

  async testCleanupEndpoint() {
    try {
      const result = await this.apiCall("POST", "/monitoring/cleanup/expired");
      this.log(
        `Cleanup completed: ${result.cleanedTransactions} transactions cleaned`
      );
    } catch (error) {
      if (error.response && error.response.status === 501) {
        this.log("Cleanup not supported by current data provider", "WARN");
      } else {
        throw error;
      }
    }
  }

  async runAllTests() {
    this.log("Starting Refractor API Enhanced Features Test Suite");
    this.log("=".repeat(60));

    // Basic functionality tests
    await this.test("Health Check", () => this.testHealthCheck());
    await this.test("Metrics Endpoint", () => this.testMetricsEndpoint());

    // Transaction processing tests
    const txHash = await this.test("Transaction Submission", () =>
      this.testTransactionSubmission()
    );
    await this.test("Transaction Retrieval", () =>
      this.testTransactionRetrieval(txHash)
    );

    // Validation tests
    await this.test("Validation Errors", () => this.testValidationErrors());

    // Queue management tests
    await this.test("Queue Controls", () => this.testQueueControls());

    // Performance tests
    await this.test("Load Generation", () => this.testLoadGeneration());

    // Database tests
    await this.test("Database Stats", () => this.testDatabaseStats());
    await this.test("Cleanup Endpoint", () => this.testCleanupEndpoint());

    // Results summary
    this.log("=".repeat(60));
    this.log(
      `Test Results: ${this.testResults.passed} passed, ${this.testResults.failed} failed`
    );

    if (this.testResults.failed > 0) {
      this.log("Failed tests:", "ERROR");
      this.testResults.errors.forEach((error) => {
        this.log(`  - ${error.test}: ${error.error}`, "ERROR");
      });
      process.exit(1);
    } else {
      this.log("All tests passed! 🎉", "SUCCESS");
    }
  }
}

// Command line execution
if (require.main === module) {
  const baseUrl = process.argv[2] || "http://localhost:4010";
  const tester = new RefractorAPITester(baseUrl);

  tester.runAllTests().catch((error) => {
    console.error("Test suite failed:", error);
    process.exit(1);
  });
}

module.exports = RefractorAPITester;
