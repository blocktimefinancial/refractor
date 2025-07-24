const EnhancedQueue = require("../queue/enhanced-queue"),
  storageLayer = require("../../storage/storage-layer"),
  { rehydrateTx } = require("../tx-loader"),
  { processCallback } = require("./callback-handler"),
  { submitTransaction } = require("./horizon-handler"),
  { getUnixTimestamp } = require("../timestamp-utils");
const config = require("../../app.config");

class Finalizer {
  constructor() {
    // Initialize enhanced queue with monitoring and adaptive concurrency
    this.finalizerQueue = new EnhancedQueue(this.processTxWrapper.bind(this), {
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
    let foundCount = 0;
    try {
      const now = getUnixTimestamp();
      console.log(
        `[DEBUG] Finalizer query - Current time: ${now}, looking for status=ready with minTime <= ${now}`
      );

      //get transactions ready to be submitted
      const cursor = await storageLayer.dataProvider.listTransactions({
        status: "ready",
        minTime: { $lte: now },
      });

      for await (let txInfo of cursor) {
        foundCount++;
        console.log(
          `[DEBUG] Found ready transaction: ${txInfo.hash}, minTime: ${txInfo.minTime}, status: ${txInfo.status}`
        );
        console.log(
          `[DEBUG] Transaction object:`,
          JSON.stringify(txInfo, null, 2)
        );

        if (this.processorTimerHandler === 0) {
          //pipeline stop executed
          console.log(
            `[DEBUG] Processor timer handler is 0, stopping processing`
          );
          return;
        }
        console.log(`[DEBUG] Pushing transaction ${txInfo.hash} to queue`);
        this.finalizerQueue.push(txInfo);
        //the queue length should not exceed the max queue size
        if (this.finalizerQueue.length() >= this.targetQueueSize) {
          console.log(
            `[DEBUG] Queue size limit reached (${this.targetQueueSize}), breaking batch but continuing processing`
          );
          break;
        }
      }
      console.log(
        `[DEBUG] Finalizer batch complete - found ${foundCount} ready transactions`
      );
    } catch (e) {
      console.error(e);
    }

    // If we found transactions and hit the queue size limit, schedule next batch sooner
    // Also check if there might be more transactions waiting
    let nextTimeout;
    if (foundCount >= this.targetQueueSize) {
      // We hit the queue limit, check again quickly for remaining transactions
      nextTimeout = 500;
    } else if (foundCount > 0) {
      // Found some transactions but not many, check again at normal interval
      nextTimeout = this.tickerTimeout;
    } else {
      // No transactions found, use normal interval
      nextTimeout = this.tickerTimeout;
    }

    console.log(
      `[DEBUG] Scheduling next batch in ${nextTimeout}ms (found ${foundCount} transactions, queue limit: ${this.targetQueueSize})`
    );

    this.processorTimerHandler = setTimeout(
      () => this.scheduleTransactionsBatch(),
      nextTimeout
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
    console.log(
      `[DEBUG] ProcessTx called for: ${txInfo.hash}, status: ${txInfo.status}`
    );

    if (txInfo.status !== "ready") {
      console.log(
        `[DEBUG] Skipping transaction ${txInfo.hash} - status is not ready: ${txInfo.status}`
      );
      return;
    }

    try {
      //lock tx
      console.log(`[DEBUG] Attempting to lock transaction ${txInfo.hash}`);
      if (
        !(await storageLayer.dataProvider.updateTxStatus(
          txInfo.hash,
          "processing",
          "ready"
        ))
      ) {
        console.log(
          `[DEBUG] Failed to obtain lock for transaction ${txInfo.hash}`
        );
        return; //failed to obtain a lock - some other thread is currently processing this transaction
      }
      console.log(`[DEBUG] Successfully locked transaction ${txInfo.hash}`);
    } catch (e) {
      console.error(`[DEBUG] Error locking transaction ${txInfo.hash}:`, e);
      return; //invalid current state
    }

    try {
      if (txInfo.maxTime && txInfo.maxTime < getUnixTimestamp()) {
        console.log(`[DEBUG] Transaction ${txInfo.hash} has expired`);
        throw new Error(`Transaction has already expired`);
      }

      console.log(`[DEBUG] Rehydrating transaction ${txInfo.hash}`);
      const txInfoFull = rehydrateTx(txInfo);
      const update = { status: "processed" };

      console.log(
        `[DEBUG] Transaction ${txInfo.hash} - callbackUrl: ${txInfo.callbackUrl}, submit: ${txInfo.submit}`
      );

      if (txInfo.callbackUrl) {
        console.log(
          `[DEBUG] Processing callback for transaction ${txInfo.hash}`
        );
        await processCallback(txInfoFull);
        console.log(
          `[DEBUG] Callback processed for transaction ${txInfo.hash}`
        );
      }

      if (txInfo.submit) {
        console.log(`[DEBUG] Submitting transaction ${txInfo.hash} to horizon`);
        await submitTransaction(txInfoFull);
        update.submitted = getUnixTimestamp();
        console.log(`[DEBUG] Transaction ${txInfo.hash} submitted to horizon`);
      }

      console.log(
        `[DEBUG] Updating transaction ${txInfo.hash} status to processed`
      );
      if (
        !(await storageLayer.dataProvider.updateTransaction(
          txInfo.hash,
          update,
          "processing"
        ))
      ) {
        console.log(
          `[DEBUG] Failed to update transaction ${txInfo.hash} to processed status`
        );
        throw new Error(`State conflict after callback execution`);
      }
      console.log(
        `[DEBUG] Successfully updated transaction ${txInfo.hash} to processed status`
      );
    } catch (e) {
      console.error("TX " + txInfo.hash + " processing failed");
      console.error(e);

      // Enhanced error information capture
      const errorInfo = {
        message: e.message + (e.result_codes || "") || e.toString(),
        stack: e.stack,
        timestamp: new Date().toISOString(),
        hash: txInfo.hash,
      };

      console.log(
        `[DEBUG] Updating transaction ${txInfo.hash} status to failed with error:`,
        errorInfo
      );

      await storageLayer.dataProvider.updateTxStatus(
        txInfo.hash,
        "failed",
        "processing",
        e
      );
      throw e; // Re-throw for enhanced queue to handle
    }
  }

  /**
   * Wrapper method to bridge the gap between FastQ callback style and async/await
   */
  processTxWrapper(txInfo) {
    console.log(
      `[DEBUG] ProcessTxWrapper called with:`,
      JSON.stringify(txInfo, null, 2)
    );

    // Extract the actual transaction data from Mongoose document
    let actualTxInfo;
    if (txInfo._doc) {
      // This is a Mongoose document, extract the _doc property
      actualTxInfo = { ...txInfo._doc };
    } else if (txInfo.toJSON) {
      // This is a Mongoose document with toJSON method
      actualTxInfo = txInfo.toJSON();
    } else {
      // This is already a plain object
      actualTxInfo = txInfo;
    }

    console.log(
      `[DEBUG] Extracted transaction data:`,
      JSON.stringify(actualTxInfo, null, 2)
    );

    return this.processTx(actualTxInfo);
  }

  /**
   * Trigger an immediate check for ready transactions (used when new transactions become ready)
   */
  triggerImmediateCheck() {
    // Only trigger if we're not already at capacity and not currently stopping
    if (
      this.processorTimerHandler !== 0 &&
      this.finalizerQueue.length() < this.targetQueueSize
    ) {
      console.log(
        `[DEBUG] Immediate check triggered - queue length: ${this.finalizerQueue.length()}`
      );
      clearTimeout(this.processorTimerHandler);
      setImmediate(() => this.scheduleTransactionsBatch());
    }
  }

  start() {
    this.scheduleTransactionsBatch().catch((e) => console.error(e));
  }

  async stop() {
    clearTimeout(this.processorTimerHandler);
    this.processorTimerHandler = 0;
    //clear the pending queue and wait for completion
    console.log(
      `[DEBUG] Stopping finalizer queue, waiting for all tasks to complete`
    );
    await this.finalizerQueue.kill();
  }

  async resetProcessingStatus() {
    console.log(`[DEBUG] Resetting processing status for all transactions`);
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
