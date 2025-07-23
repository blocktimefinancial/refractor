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
    throughput: metrics.throughput.toFixed(2),
    queueLength: metrics.queueLength,
    concurrency: metrics.concurrency,
    successRate: (metrics.successRate * 100).toFixed(1) + "%",
  });
});

horizonQueue.on("taskFailed", ({ taskId, attempts, error }) => {
  console.error(
    `Horizon submission ${taskId} failed after ${attempts} attempts:`,
    error.message
  );
});

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
    // Enhanced error handling for Horizon-specific errors
    if (error.response && error.response.status) {
      const horizonError = new Error("Transaction submission failed");
      horizonError.status = error.response.status;
      if (error.response?.data?.extras) {
        horizonError.result_codes = error.response.data.extras.result_codes;
      }
      throw horizonError;
    }
    throw error;
  }
}

module.exports = { submitTransaction, setSubmitTransactionCallback };
