const EnhancedQueue = require("../queue/enhanced-queue"),
  storageLayer = require("../../storage/storage-layer"),
  { rehydrateTx } = require("../tx-loader"),
  { processCallback } = require("./callback-handler"),
  { submitTransaction } = require("./horizon-handler"),
  { getUnixTimestamp } = require("../timestamp-utils");
const config = require("../../app.config.json");

class Finalizer {
  constructor() {
    // Initialize enhanced queue with monitoring and adaptive concurrency
    this.finalizerQueue = new EnhancedQueue(this.processTx.bind(this), {
      concurrency: config.parallelTasks || 50,
      maxConcurrency: config.maxParallelTasks || 100,
      minConcurrency: config.minParallelTasks || 1,
      adaptiveConcurrency: config.adaptiveConcurrency || true,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      metricsInterval: config.metricsInterval || 30000,
    });

    // Set up queue event listeners for monitoring
    this.setupQueueMonitoring();
  }

  finalizerQueue;

  targetQueueSize = config.targetQueueSize;

  tickerTimeout = config.tickerTimeout;

  processorTimerHandler = -1;

  /**
   * Set up monitoring for the enhanced queue
   */
  setupQueueMonitoring() {
    this.finalizerQueue.on("metrics", (metrics) => {
      console.log("Finalizer Queue Metrics:", {
        processed: metrics.processed,
        failed: metrics.failed,
        throughput: metrics.throughput.toFixed(2),
        queueLength: metrics.queueLength,
        concurrency: metrics.concurrency,
        successRate: (metrics.successRate * 100).toFixed(1) + "%",
        avgProcessingTime: metrics.avgProcessingTime.toFixed(0) + "ms",
      });
    });

    this.finalizerQueue.on(
      "concurrencyAdjusted",
      ({ oldConcurrency, newConcurrency, reason }) => {
        console.log(
          `Finalizer concurrency adjusted: ${oldConcurrency} -> ${newConcurrency}`,
          reason
        );
      }
    );

    this.finalizerQueue.on("taskFailed", ({ taskId, attempts, error }) => {
      console.error(
        `Transaction ${taskId} failed after ${attempts} attempts:`,
        error.message
      );
    });

    this.finalizerQueue.on("taskRetry", ({ taskId, attempt, error }) => {
      console.warn(
        `Retrying transaction ${taskId} (attempt ${attempt}):`,
        error.message
      );
    });
  }

  async scheduleTransactionsBatch() {
    try {
      const now = getUnixTimestamp();
      //get transactions ready to be submitted
      const cursor = await storageLayer.dataProvider.listTransactions({
        status: "ready",
        minTime: { $lte: now },
      });
      for await (let txInfo of cursor) {
        if (this.processorTimerHandler === 0)
          //pipeline stop executed
          return;
        this.finalizerQueue.push(txInfo);
        //the queue length should not exceed the max queue size
        if (this.finalizerQueue.length() >= this.targetQueueSize) break;
      }
    } catch (e) {
      console.error(e);
    }
    this.processorTimerHandler = setTimeout(
      () => this.scheduleTransactionsBatch(),
      this.tickerTimeout
    );
  }

  setQueueConcurrency(concurrency) {
    this.finalizerQueue.setConcurrency(concurrency);
  }

  /**
   * Get queue metrics for monitoring
   */
  getQueueMetrics() {
    return this.finalizerQueue.getMetrics();
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return this.finalizerQueue.status();
  }

  /**
   * Process fully signed tx
   * @param {TxModel} txInfo
   * @returns {Promise} - Enhanced queue expects promises, not callbacks
   */
  async processTx(txInfo) {
    if (txInfo.status !== "ready") return;

    try {
      //lock tx
      if (
        !(await storageLayer.dataProvider.updateTxStatus(
          txInfo.hash,
          "processing",
          "ready"
        ))
      )
        return; //failed to obtain a lock - some other thread is currently processing this transaction
    } catch (e) {
      console.error(e);
      return; //invalid current state
    }

    try {
      if (txInfo.maxTime && txInfo.maxTime < getUnixTimestamp())
        throw new Error(`Transaction has already expired`);

      const txInfoFull = rehydrateTx(txInfo);
      const update = { status: "processed" };

      if (txInfo.callbackUrl) {
        await processCallback(txInfoFull);
      }

      if (txInfo.submit) {
        await submitTransaction(txInfoFull);
        update.submitted = getUnixTimestamp();
      }

      if (
        !(await storageLayer.dataProvider.updateTransaction(
          txInfo.hash,
          update,
          "processing"
        ))
      )
        throw new Error(`State conflict after callback execution`);
    } catch (e) {
      console.error("TX " + txInfo.hash + " processing failed");
      console.error(e);
      await storageLayer.dataProvider.updateTxStatus(
        txInfo.hash,
        "failed",
        "processing",
        e
      );
      throw e; // Re-throw for enhanced queue to handle
    }
  }

  start() {
    this.scheduleTransactionsBatch().catch((e) => console.error(e));
  }

  async stop() {
    clearTimeout(this.processorTimerHandler);
    this.processorTimerHandler = 0;
    //clear the pending queue and wait for completion
    await this.finalizerQueue.kill();
  }

  async resetProcessingStatus() {
    const cursor = await storageLayer.dataProvider.listTransactions({
      status: "processing",
    });
    for await (let txInfo of cursor) {
      await storageLayer.dataProvider.updateTxStatus(
        txInfo.hash,
        "ready",
        "processing"
      );
    }
  }
}

const finalizer = new Finalizer();

module.exports = finalizer;
