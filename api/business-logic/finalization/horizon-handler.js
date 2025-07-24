const { Horizon, TransactionBuilder } = require("@stellar/stellar-sdk"),
  EnhancedQueue = require("../queue/enhanced-queue"),
  { resolveNetwork } = require("../network-resolver");
const config = require("../../app.config.json");

const servers = {};

/**
 * @param {TxModel} txInfo
 * @return {Promise}
 */
let submitTransactionWorker = function (txInfo) {
  let horizon = servers[txInfo.network];
  const network = resolveNetwork(txInfo.network);
  if (!horizon) {
    servers[txInfo.network] = horizon = new Horizon.Server(network.horizon);
  }
  return horizon.submitTransaction(
    TransactionBuilder.fromXDR(txInfo.xdr, network.passphrase),
    { skipMemoRequiredCheck: true }
  );
};

// Enhanced queue for Horizon submissions with retry logic and monitoring
const horizonQueue = new EnhancedQueue(submitTransactionWorker, {
  concurrency: config.horizonConcurrency || 10,
  maxConcurrency: config.maxHorizonConcurrency || 20,
  minConcurrency: 1,
  adaptiveConcurrency: config.adaptiveHorizonConcurrency || true,
  retryAttempts: config.horizonRetryAttempts || 5,
  retryDelay: config.horizonRetryDelay || 2000,
  metricsInterval: config.metricsInterval || 30000,
});

// Set up monitoring for horizon queue
horizonQueue.on("metrics", (metrics) => {
  console.log("Horizon Queue Metrics:", {
    processed: metrics.processed,
    failed: metrics.failed,
    retries: metrics.retries,
    throughput: metrics.throughput.toFixed(2),
    queueLength: metrics.queueLength,
    running: metrics.running,
    concurrency: metrics.concurrency,
    successRate: (metrics.successRate * 100).toFixed(1) + "%",
    utilization: (metrics.utilization * 100).toFixed(1) + "%",
    avgProcessingTime: metrics.avgProcessingTime?.toFixed(0) + "ms",
  });
});

horizonQueue.on("taskFailed", ({ taskId, attempts, error }) => {
  const errorInfo = {
    taskId,
    attempts,
    errorType: error.name || "UnknownError",
    message: error.message,
  };

  if (error.status) {
    errorInfo.httpStatus = error.status;
  }

  if (error.status === 429) {
    console.warn(`[WARN] Horizon rate limit failure:`, errorInfo);
  } else {
    console.error(`[ERROR] Horizon submission failure:`, errorInfo);
  }
});

horizonQueue.on("taskRetry", ({ taskId, attempt, error }) => {
  if (error.status === 429) {
    console.warn(
      `[WARN] Retrying rate-limited task ${taskId} (attempt ${attempt})`
    );
  } else {
    console.warn(
      `[WARN] Retrying failed task ${taskId} (attempt ${attempt}): ${error.message}`
    );
  }
});

horizonQueue.on(
  "concurrencyAdjusted",
  ({ oldConcurrency, newConcurrency, reason }) => {
    console.log(
      `[INFO] Horizon concurrency adjusted: ${oldConcurrency} → ${newConcurrency}`,
      reason
    );
  }
);

function setSubmitTransactionCallback(callback) {
  submitTransactionWorker = callback;
}

/**
 * Submit a prepared transaction to Horizon.
 * @param {TxModel} txInfo
 * @return {Promise<TxModel>}
 */
async function submitTransaction(txInfo) {
  try {
    const result = await horizonQueue.push(txInfo);
    txInfo.result = result;
    return txInfo;
  } catch (error) {
    // Enhanced error handling that preserves original error details
    let enhancedError;

    if (error.response && error.response.status) {
      // Preserve the original error structure for Horizon-specific errors
      enhancedError = new Error(
        `Horizon submission failed: ${error.message || "Unknown error"}`
      );
      enhancedError.name = "HorizonSubmissionError";
      enhancedError.status = error.response.status;
      enhancedError.originalError = error;

      // Preserve important Horizon error details
      if (error.response.data) {
        enhancedError.data = error.response.data;
        if (error.response.data.extras) {
          enhancedError.result_codes = error.response.data.extras.result_codes;
          enhancedError.operation_codes =
            error.response.data.extras.operation_codes;
        }
        if (error.response.data.detail) {
          enhancedError.detail = error.response.data.detail;
        }
      }

      // Special logging for rate limit errors
      if (error.response.status === 429) {
        console.warn(
          `[WARN] Rate limit encountered for transaction ${txInfo.hash}:`,
          {
            status: enhancedError.status,
            detail: enhancedError.detail,
            retryAfter: error.response.headers?.["retry-after"],
          }
        );
      } else {
        console.error(
          `[ERROR] Horizon submission error for transaction ${txInfo.hash}:`,
          {
            status: enhancedError.status,
            detail: enhancedError.detail,
            result_codes: enhancedError.result_codes,
            operation_codes: enhancedError.operation_codes,
          }
        );
      }
    } else {
      // Handle network errors and other non-HTTP errors
      enhancedError = new Error(
        `Transaction submission failed: ${error.message || error.toString()}`
      );
      enhancedError.name = "TransactionSubmissionError";
      enhancedError.originalError = error;

      // Preserve error codes for network issues
      if (error.code) {
        enhancedError.code = error.code;
      }

      console.error(
        `[ERROR] Non-HTTP submission error for transaction ${txInfo.hash}:`,
        {
          message: enhancedError.message,
          code: enhancedError.code,
          originalError: error.message,
        }
      );
    }

    throw enhancedError;
  }
}

module.exports = { submitTransaction, setSubmitTransactionCallback };
