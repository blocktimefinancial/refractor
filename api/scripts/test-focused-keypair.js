#!/usr/bin/env node

/**
 * Focused test for 1 transaction per keypair limitation
 * Tests what happens when multiple signed transactions use the same keypair
 */

const axios = require("axios");
const stellarSdk = require("@stellar/stellar-sdk");

class FocusedKeypairTest {
  constructor(baseUrl = "http://localhost:4010") {
    this.baseUrl = baseUrl;
  }

  log(message, level = "INFO") {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level}: ${message}`);
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

  async testKeypairLimitation() {
    this.log("🧪 Testing 1 Transaction Per Keypair Limitation...");

    // Create a single keypair that we'll reuse
    const sourceKeypair = stellarSdk.Keypair.random();
    this.log(`📝 Using source keypair: ${sourceKeypair.publicKey()}`);

    // Create 3 different transactions using the same source keypair
    const transactions = [];
    for (let i = 0; i < 3; i++) {
      const destKeypair = stellarSdk.Keypair.random();
      const sourceAccount = new stellarSdk.Account(
        sourceKeypair.publicKey(),
        i.toString()
      );

      const transaction = new stellarSdk.TransactionBuilder(sourceAccount, {
        fee: stellarSdk.BASE_FEE,
        networkPassphrase: stellarSdk.Networks.TESTNET,
      })
        .addOperation(
          stellarSdk.Operation.payment({
            destination: destKeypair.publicKey(),
            asset: stellarSdk.Asset.native(),
            amount: "0.1",
          })
        )
        .setTimeout(300)
        .build();

      // Sign the transaction
      transaction.sign(sourceKeypair);

      const txData = {
        hash: transaction.hash().toString("hex"),
        network: 1,
        xdr: transaction.toEnvelope().toXDR("base64"),
        signatures: [
          {
            key: sourceKeypair.publicKey(),
            signature: transaction.signatures[0].signature().toString("base64"),
          },
        ],
        submit: false,
        desiredSigners: [sourceKeypair.publicKey()],
        minTime: 0,
        maxTime: Math.floor(Date.now() / 1000) + 3600,
      };

      transactions.push(txData);
    }

    this.log(
      `📤 Submitting ${transactions.length} signed transactions with same keypair...`
    );

    // Submit all transactions
    const results = [];
    for (let i = 0; i < transactions.length; i++) {
      try {
        const response = await this.apiCall("POST", "/tx", transactions[i]);
        results.push({
          index: i,
          success: true,
          hash: response.hash,
          status: response.status,
        });
        this.log(`✅ Transaction ${i}: ${response.hash} - ${response.status}`);
      } catch (error) {
        results.push({
          index: i,
          success: false,
          error: error.response?.data?.error || error.message,
        });
        this.log(
          `❌ Transaction ${i}: ${error.response?.data?.error || error.message}`
        );
      }

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    this.log("");
    this.log("📊 Results Summary:");
    this.log(`- Successful: ${results.filter((r) => r.success).length}`);
    this.log(`- Failed: ${results.filter((r) => !r.success).length}`);

    // Check transaction statuses
    this.log("");
    this.log("🔍 Checking transaction statuses...");
    for (const result of results) {
      if (result.success) {
        try {
          const response = await this.apiCall("GET", `/tx/${result.hash}`);
          this.log(`📋 ${result.hash}: ${response.status}`);
        } catch (error) {
          this.log(`❌ Failed to check ${result.hash}: ${error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  async testDifferentKeypairs() {
    this.log("");
    this.log("🧪 Testing Different Keypairs (Control Test)...");

    const transactions = [];
    const keypairs = [];

    // Create 3 transactions using different keypairs
    for (let i = 0; i < 3; i++) {
      const sourceKeypair = stellarSdk.Keypair.random();
      const destKeypair = stellarSdk.Keypair.random();
      keypairs.push(sourceKeypair);

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
            destination: destKeypair.publicKey(),
            asset: stellarSdk.Asset.native(),
            amount: "0.1",
          })
        )
        .setTimeout(300)
        .build();

      // Sign the transaction
      transaction.sign(sourceKeypair);

      const txData = {
        hash: transaction.hash().toString("hex"),
        network: 1,
        xdr: transaction.toEnvelope().toXDR("base64"),
        signatures: [
          {
            key: sourceKeypair.publicKey(),
            signature: transaction.signatures[0].signature().toString("base64"),
          },
        ],
        submit: false,
        desiredSigners: [sourceKeypair.publicKey()],
        minTime: 0,
        maxTime: Math.floor(Date.now() / 1000) + 3600,
      };

      transactions.push(txData);
    }

    this.log(
      `📤 Submitting ${transactions.length} signed transactions with different keypairs...`
    );

    // Submit all transactions
    const results = [];
    for (let i = 0; i < transactions.length; i++) {
      try {
        const response = await this.apiCall("POST", "/tx", transactions[i]);
        results.push({
          index: i,
          success: true,
          hash: response.hash,
          status: response.status,
          keypair: keypairs[i].publicKey(),
        });
        this.log(
          `✅ Transaction ${i} (${keypairs[i]
            .publicKey()
            .substring(0, 8)}...): ${response.hash} - ${response.status}`
        );
      } catch (error) {
        results.push({
          index: i,
          success: false,
          error: error.response?.data?.error || error.message,
          keypair: keypairs[i].publicKey(),
        });
        this.log(
          `❌ Transaction ${i} (${keypairs[i]
            .publicKey()
            .substring(0, 8)}...): ${
            error.response?.data?.error || error.message
          }`
        );
      }

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    this.log("");
    this.log("📊 Different Keypairs Results:");
    this.log(`- Successful: ${results.filter((r) => r.success).length}`);
    this.log(`- Failed: ${results.filter((r) => !r.success).length}`);

    return results;
  }

  async checkMetrics() {
    this.log("");
    this.log("📊 Checking API Metrics...");

    try {
      const metrics = await this.apiCall("GET", "/monitoring/metrics");

      if (metrics.finalizer && metrics.finalizer.metrics) {
        const { processed, failed, queueLength, concurrency } =
          metrics.finalizer.metrics;
        this.log(
          `Queue Metrics - Processed: ${processed}, Failed: ${failed}, Queue: ${queueLength}, Concurrency: ${concurrency}`
        );
      }

      if (metrics.database) {
        const { total, byStatus } = metrics.database;
        this.log(
          `Database - Total: ${total}, By Status: ${JSON.stringify(byStatus)}`
        );
      }

      return metrics;
    } catch (error) {
      this.log(`Failed to fetch metrics: ${error.message}`, "ERROR");
      return null;
    }
  }

  async runFocusedTest() {
    this.log("🚀 Starting Focused Keypair Limitation Test");
    this.log("=".repeat(70));

    try {
      // Test same keypair scenario
      const sameKeypairResults = await this.testKeypairLimitation();

      // Test different keypairs scenario (control)
      const differentKeypairResults = await this.testDifferentKeypairs();

      // Check metrics
      await this.checkMetrics();

      // Analysis
      this.log("");
      this.log("=".repeat(70));
      this.log("📋 ANALYSIS RESULTS:");
      this.log(
        `• Same Keypair Test: ${
          sameKeypairResults.filter((r) => r.success).length
        }/3 transactions successful`
      );
      this.log(
        `• Different Keypairs Test: ${
          differentKeypairResults.filter((r) => r.success).length
        }/3 transactions successful`
      );

      this.log("");
      this.log("🔍 KEY FINDINGS:");

      if (
        sameKeypairResults.filter((r) => r.success).length ===
        differentKeypairResults.filter((r) => r.success).length
      ) {
        this.log("• ✅ API accepts multiple transactions from same keypair");
        this.log(
          "• ℹ️  No special 1-transaction-per-keypair limitation detected at submission level"
        );
      } else {
        this.log(
          "• ⚠️  Different behavior detected between same vs different keypairs"
        );
        this.log("• 🎯 This indicates keypair-based transaction limiting");
      }

      this.log(
        "• 📝 Transaction processing depends on signatures and sequence numbers"
      );
      this.log(
        "• 🔄 Finalizer processes transactions based on readiness and signatures"
      );

      this.log("=".repeat(70));
      this.log("✅ Focused test completed successfully!");
    } catch (error) {
      this.log(`Test failed: ${error.message}`, "ERROR");
      throw error;
    }
  }
}

// Command line execution
if (require.main === module) {
  const baseUrl = process.argv[2] || "http://localhost:4010";
  const tester = new FocusedKeypairTest(baseUrl);

  tester.runFocusedTest().catch((error) => {
    console.error("Focused keypair test failed:", error);
    process.exit(1);
  });
}

module.exports = FocusedKeypairTest;
