#!/usr/bin/env node

/**
 * Test script to analyze horizon-handler error handling issues
 */

console.log("🔍 Analyzing Horizon Handler Error Handling...");

// Test the error handling logic
function analyzeErrorHandling() {
  console.log("\n📊 Analyzing Error Handling Patterns...");

  // Test 1: Standard Horizon error
  console.log("\n🧪 Test 1: Standard Horizon Error");
  const horizonError = {
    response: {
      status: 400,
      data: {
        extras: {
          result_codes: {
            transaction: "tx_bad_seq",
            operations: ["op_success"],
          },
        },
      },
    },
    message: "Request failed with status code 400",
  };

  console.log("Original error:", {
    status: horizonError.response.status,
    result_codes: horizonError.response.data.extras.result_codes,
  });

  // Simulate horizon-handler error processing
  const processedError = new Error("Transaction submission failed");
  processedError.status = horizonError.response.status;
  processedError.result_codes = horizonError.response.data.extras.result_codes;

  console.log("Processed error:", {
    message: processedError.message,
    status: processedError.status,
    result_codes: processedError.result_codes,
  });

  // Test 2: Network timeout error
  console.log("\n🧪 Test 2: Network Timeout Error");
  const timeoutError = new Error("Network timeout");
  timeoutError.code = "ETIMEDOUT";

  console.log("Original timeout error:", {
    message: timeoutError.message,
    code: timeoutError.code,
  });

  // Simulate horizon-handler processing
  const processedTimeoutError = new Error(
    "Failed to submit transaction to Horizon: " + timeoutError.message
  );
  console.log("Processed timeout error:", {
    message: processedTimeoutError.message,
  });

  // Test 3: Rate limiting error
  console.log("\n🧪 Test 3: Rate Limiting Error");
  const rateLimitError = {
    response: {
      status: 429,
      data: {
        title: "Rate Limit Exceeded",
        detail: "Too many requests",
      },
    },
  };

  console.log("Rate limit error:", {
    status: rateLimitError.response.status,
    title: rateLimitError.response.data.title,
  });

  // Test 4: Connection refused
  console.log("\n🧪 Test 4: Connection Refused");
  const connectionError = new Error("connect ECONNREFUSED");
  connectionError.code = "ECONNREFUSED";

  console.log("Connection error:", {
    message: connectionError.message,
    code: connectionError.code,
  });
}

// Analyze retry logic
function analyzeRetryLogic() {
  console.log("\n📊 Analyzing Retry Logic...");

  const errors = [
    { name: "ValidationError", status: null, shouldRetry: false },
    { name: "Error", status: 400, shouldRetry: false }, // Bad request
    { name: "Error", status: 401, shouldRetry: false }, // Unauthorized
    { name: "Error", status: 404, shouldRetry: false }, // Not found
    { name: "Error", status: 429, shouldRetry: true }, // Rate limit
    { name: "Error", status: 500, shouldRetry: true }, // Server error
    { name: "Error", status: 502, shouldRetry: true }, // Bad gateway
    { name: "Error", status: 503, shouldRetry: true }, // Service unavailable
    { name: "Error", status: 504, shouldRetry: true }, // Gateway timeout
    { name: "Error", status: null, shouldRetry: true }, // Network error
  ];

  console.log("\n🔍 Retry Logic Analysis:");
  errors.forEach((error) => {
    const shouldRetry = shouldRetryError(error);
    const match = shouldRetry === error.shouldRetry ? "✅" : "❌";
    console.log(
      `${match} ${error.name} (${error.status || "no status"}): ${
        shouldRetry ? "RETRY" : "NO RETRY"
      }`
    );
  });
}

// Copy of the shouldRetry logic from EnhancedQueue
function shouldRetryError(error) {
  // Don't retry validation errors or client errors (4xx)
  if (
    error.name === "ValidationError" ||
    (error.status && error.status >= 400 && error.status < 500)
  ) {
    return false;
  }

  // Retry network errors, timeouts, and server errors
  return true;
}

// Analyze potential issues
function identifyPotentialIssues() {
  console.log("\n⚠️  Potential Issues Identified:");

  console.log("\n1. 🔍 Error Wrapping Issues:");
  console.log("   - Horizon errors are wrapped in new Error objects");
  console.log("   - Original error details might be lost");
  console.log("   - Stack traces are replaced");

  console.log("\n2. 🔍 Retry Logic Issues:");
  console.log("   - 429 (Rate Limit) errors are retried");
  console.log("   - This could cause exponential backoff failures");
  console.log("   - No special handling for rate limit headers");

  console.log("\n3. 🔍 Queue Overwhelm Issues:");
  console.log("   - Multiple transactions submitted rapidly");
  console.log("   - Each failure retries up to 5 times");
  console.log("   - Could overwhelm Horizon with requests");

  console.log("\n4. 🔍 Error Propagation Issues:");
  console.log("   - Horizon-specific error info might be lost");
  console.log("   - Result codes not preserved in all cases");
  console.log("   - Transaction sequence errors not handled specially");

  console.log("\n5. 🔍 Concurrency Issues:");
  console.log("   - Default concurrency: 10");
  console.log("   - Max concurrency: 20");
  console.log("   - Adaptive concurrency could spike during bulk operations");
}

// Simulate bulk transaction scenario
function simulateBulkTransactionScenario() {
  console.log("\n🚀 Simulating Bulk Transaction Scenario...");

  const transactions = 20;
  const concurrency = 10;
  const retryAttempts = 5;

  console.log(
    `📊 Scenario: ${transactions} transactions, ${concurrency} concurrent, ${retryAttempts} retries`
  );

  // Simulate different failure patterns
  const scenarios = [
    {
      name: "All succeed",
      failureRate: 0,
      totalRequests: transactions,
    },
    {
      name: "10% sequence errors (no retry)",
      failureRate: 0.1,
      retriableFailures: 0,
      totalRequests: transactions,
    },
    {
      name: "20% rate limit errors (with retry)",
      failureRate: 0.2,
      retriableFailures: 0.2,
      totalRequests: transactions + transactions * 0.2 * retryAttempts,
    },
    {
      name: "50% mixed errors",
      failureRate: 0.5,
      retriableFailures: 0.25, // Half of failures are retriable
      totalRequests: transactions + transactions * 0.25 * retryAttempts,
    },
  ];

  scenarios.forEach((scenario) => {
    console.log(`\n📈 ${scenario.name}:`);
    console.log(
      `   - Failed transactions: ${Math.floor(
        transactions * scenario.failureRate
      )}`
    );
    console.log(
      `   - Retriable failures: ${Math.floor(
        transactions * (scenario.retriableFailures || 0)
      )}`
    );
    console.log(
      `   - Total requests to Horizon: ${Math.floor(scenario.totalRequests)}`
    );
    console.log(
      `   - Request amplification: ${(
        scenario.totalRequests / transactions
      ).toFixed(1)}x`
    );
  });
}

// Main execution
function main() {
  console.log("=".repeat(60));
  console.log("🧪 HORIZON HANDLER ERROR ANALYSIS");
  console.log("=".repeat(60));

  analyzeErrorHandling();
  analyzeRetryLogic();
  identifyPotentialIssues();
  simulateBulkTransactionScenario();

  console.log("\n" + "=".repeat(60));
  console.log("✅ Analysis complete");
  console.log("=".repeat(60));
}

main();
