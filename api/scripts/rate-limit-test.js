#!/usr/bin/env node

/**
 * Rate limit stress test for the Refractor API
 * Tests the new 100 requests per second limit
 */

const axios = require("axios");
const stellarSdk = require("@stellar/stellar-sdk");

class RateLimitTester {
  constructor(baseUrl = "http://localhost:4010") {
    this.baseUrl = baseUrl;
  }

  generateTestTransaction() {
    const sourceKeypair = stellarSdk.Keypair.random();
    const destinationKeypair = stellarSdk.Keypair.random();
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

    return {
      hash: transaction.hash().toString("hex"),
      network: 1,
      xdr: transaction.toEnvelope().toXDR("base64"),
      signatures: [],
      submit: false,
      callbackUrl: null,
      desiredSigners: [],
      minTime: 0,
      maxTime: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  async makeRequest(i) {
    const testTx = this.generateTestTransaction();
    const startTime = Date.now();

    try {
      const response = await axios.post(`${this.baseUrl}/tx`, testTx, {
        headers: { "Content-Type": "application/json" },
      });
      const duration = Date.now() - startTime;
      return { success: true, duration, status: response.status, index: i };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration,
        status: error.response?.status || 0,
        error: error.response?.status === 429 ? "Rate Limited" : error.message,
        index: i,
      };
    }
  }

  async testRateLimit(requestsPerSecond = 50, duration = 5) {
    console.log(
      `\n🚀 Testing ${requestsPerSecond} requests/second for ${duration} seconds`
    );
    console.log("============================================================");

    const interval = 1000 / requestsPerSecond; // ms between requests
    const totalRequests = requestsPerSecond * duration;
    const promises = [];

    const startTime = Date.now();

    // Send requests at the specified rate
    for (let i = 0; i < totalRequests; i++) {
      setTimeout(() => {
        promises.push(this.makeRequest(i));
      }, i * interval);
    }

    // Wait for all requests to complete
    await new Promise((resolve) => setTimeout(resolve, (duration + 1) * 1000));
    const results = await Promise.all(promises);
    const endTime = Date.now();

    // Analyze results
    const successful = results.filter((r) => r.success).length;
    const rateLimited = results.filter((r) => r.status === 429).length;
    const errors = results.filter((r) => !r.success && r.status !== 429).length;
    const avgDuration =
      results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const actualDuration = (endTime - startTime) / 1000;
    const actualRate = successful / actualDuration;

    console.log(`\n📊 Results:`);
    console.log(`  Total requests: ${totalRequests}`);
    console.log(
      `  Successful: ${successful} (${(
        (successful / totalRequests) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `  Rate limited (429): ${rateLimited} (${(
        (rateLimited / totalRequests) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `  Other errors: ${errors} (${((errors / totalRequests) * 100).toFixed(
        1
      )}%)`
    );
    console.log(`  Average response time: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Actual rate achieved: ${actualRate.toFixed(1)} req/sec`);
    console.log(`  Test duration: ${actualDuration.toFixed(1)}s`);

    return { successful, rateLimited, errors, actualRate };
  }

  async runTests() {
    console.log("🧪 Rate Limit Stress Test for Refractor API");
    console.log("Testing new 100 requests/second limit");

    try {
      // Test different request rates
      await this.testRateLimit(25, 3); // 25 req/sec - should work fine
      await this.testRateLimit(50, 3); // 50 req/sec - should work fine
      await this.testRateLimit(75, 3); // 75 req/sec - should work fine
      await this.testRateLimit(100, 3); // 100 req/sec - at the limit
      await this.testRateLimit(150, 3); // 150 req/sec - should get rate limited

      console.log("\n✅ Rate limit testing completed!");
    } catch (error) {
      console.error("❌ Test failed:", error.message);
    }
  }
}

if (require.main === module) {
  const tester = new RateLimitTester();
  tester.runTests();
}

module.exports = RateLimitTester;
