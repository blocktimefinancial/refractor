#!/usr/bin/env node

/**
 * Test script to verify rate limiting and error handling fixes
 */

const EnhancedQueue = require("../business-logic/queue/enhanced-queue");

// Mock Horizon worker that simulates rate limiting
const mockHorizonWorker = async (task) => {
  const { id, shouldFail } = task;

  // Simulate processing time
  await new Promise((resolve) =>
    setTimeout(resolve, 100 + Math.random() * 200)
  );

  if (shouldFail === "rate_limit") {
    const error = new Error("Rate limit exceeded");
    error.status = 429;
    error.response = {
      status: 429,
      data: {
        detail: "Rate limit exceeded. Please try again later.",
        extras: {
          result_codes: {
            transaction: "tx_failed",
            operations: ["op_rate_limit_exceeded"],
          },
        },
      },
      headers: {
        "retry-after": "10",
      },
    };
    throw error;
  }

  if (shouldFail === "server_error") {
    const error = new Error("Internal server error");
    error.status = 500;
    throw error;
  }

  if (shouldFail === "validation_error") {
    const error = new Error("Invalid transaction");
    error.status = 400;
    throw error;
  }

  if (shouldFail === "network_error") {
    const error = new Error("Connection timeout");
    error.code = "ETIMEDOUT";
    throw error;
  }

  return { success: true, id, timestamp: Date.now() };
};

async function testRateLimitHandling() {
  console.log("[TEST] Starting rate limit handling test...");

  const queue = new EnhancedQueue(mockHorizonWorker, {
    concurrency: 5,
    maxConcurrency: 10,
    retryAttempts: 3,
    retryDelay: 500,
    adaptiveConcurrency: true,
    metricsInterval: 2000,
  });

  // Set up monitoring
  queue.on("metrics", (metrics) => {
    console.log(
      `[METRICS] Processed: ${metrics.processed}, Failed: ${
        metrics.failed
      }, Retries: ${metrics.retries}, Concurrency: ${
        metrics.concurrency
      }, Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`
    );
  });

  queue.on("taskRetry", ({ taskId, attempt, error }) => {
    console.log(
      `[RETRY] Task ${taskId} retry attempt ${attempt}: ${error.message} (status: ${error.status})`
    );
  });

  queue.on(
    "concurrencyAdjusted",
    ({ oldConcurrency, newConcurrency, reason }) => {
      console.log(
        `[CONCURRENCY] Adjusted: ${oldConcurrency} → ${newConcurrency}`,
        reason
      );
    }
  );

  // Create test tasks
  const tasks = [];

  // Normal tasks
  for (let i = 1; i <= 10; i++) {
    tasks.push({ id: `normal_${i}` });
  }

  // Rate limit errors (should be retried)
  for (let i = 1; i <= 5; i++) {
    tasks.push({ id: `rate_limit_${i}`, shouldFail: "rate_limit" });
  }

  // Server errors (should be retried)
  for (let i = 1; i <= 3; i++) {
    tasks.push({ id: `server_error_${i}`, shouldFail: "server_error" });
  }

  // Validation errors (should NOT be retried)
  for (let i = 1; i <= 2; i++) {
    tasks.push({ id: `validation_error_${i}`, shouldFail: "validation_error" });
  }

  // Network errors (should be retried)
  for (let i = 1; i <= 2; i++) {
    tasks.push({ id: `network_error_${i}`, shouldFail: "network_error" });
  }

  console.log(`[TEST] Submitting ${tasks.length} tasks...`);

  // Submit all tasks
  const promises = tasks.map((task) =>
    queue
      .push(task)
      .catch((error) => ({ error: error.message, taskId: task.id }))
  );

  const results = await Promise.all(promises);

  // Wait for final metrics
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Analyze results
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => r.error).length;

  console.log("\n[RESULTS] Test Summary:");
  console.log(`- Total tasks: ${tasks.length}`);
  console.log(`- Successful: ${successful}`);
  console.log(`- Failed: ${failed}`);

  // Check specific error handling
  const rateLimitErrors = results.filter(
    (r) => r.error && r.taskId.includes("rate_limit")
  );
  const serverErrors = results.filter(
    (r) => r.error && r.taskId.includes("server_error")
  );
  const validationErrors = results.filter(
    (r) => r.error && r.taskId.includes("validation_error")
  );
  const networkErrors = results.filter(
    (r) => r.error && r.taskId.includes("network_error")
  );

  console.log("\n[ANALYSIS] Error handling:");
  console.log(
    `- Rate limit errors that failed: ${rateLimitErrors.length}/5 (should be lower due to retries)`
  );
  console.log(
    `- Server errors that failed: ${serverErrors.length}/3 (should be lower due to retries)`
  );
  console.log(
    `- Validation errors that failed: ${validationErrors.length}/2 (should be 2, no retries)`
  );
  console.log(
    `- Network errors that failed: ${networkErrors.length}/2 (should be lower due to retries)`
  );

  await queue.kill();

  console.log("\n[TEST] Rate limit handling test completed!");
}

if (require.main === module) {
  testRateLimitHandling().catch(console.error);
}

module.exports = { testRateLimitHandling };
