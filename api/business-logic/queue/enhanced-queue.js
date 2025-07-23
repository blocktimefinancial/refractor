const createQueue = require("fastq");
const EventEmitter = require("events");

/**
 * Enhanced FastQ wrapper with monitoring, metrics, and adaptive concurrency
 */
class EnhancedQueue extends EventEmitter {
  constructor(worker, options = {}) {
    super();

    this.options = {
      concurrency: options.concurrency || 10,
      maxConcurrency: options.maxConcurrency || 100,
      minConcurrency: options.minConcurrency || 1,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      adaptiveConcurrency: options.adaptiveConcurrency || false,
      metricsInterval: options.metricsInterval || 30000, // 30 seconds
      ...options,
    };

    this.stats = {
      processed: 0,
      failed: 0,
      retries: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0,
      currentLoad: 0,
      peakLoad: 0,
      startTime: Date.now(),
    };

    this.processingTimes = [];
    this.maxProcessingTimesSamples = 100;

    // Create the underlying fastq queue
    this.queue = createQueue(
      this.createWorkerWrapper(worker),
      this.options.concurrency
    );

    // Set up monitoring
    this.setupMonitoring();

    // Set up adaptive concurrency if enabled
    if (this.options.adaptiveConcurrency) {
      this.setupAdaptiveConcurrency();
    }
  }

  /**
   * Create a worker wrapper with retry logic and metrics collection
   */
  createWorkerWrapper(originalWorker) {
    return async (task, callback) => {
      const startTime = Date.now();
      const taskId =
        task.hash ||
        task.id ||
        `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      let attempt = 0;
      let lastError;

      const attemptTask = async () => {
        attempt++;

        try {
          this.emit("taskStart", { taskId, attempt, task });

          const result = await originalWorker(task);

          const processingTime = Date.now() - startTime;
          this.updateStats(processingTime, true);

          this.emit("taskComplete", {
            taskId,
            attempt,
            processingTime,
            result,
          });
          callback(null, result);
        } catch (error) {
          lastError = error;
          const processingTime = Date.now() - startTime;

          this.emit("taskError", { taskId, attempt, error, processingTime });

          if (attempt < this.options.retryAttempts && this.shouldRetry(error)) {
            this.stats.retries++;
            this.emit("taskRetry", { taskId, attempt: attempt + 1, error });

            // Exponential backoff with jitter
            const delay =
              this.options.retryDelay * Math.pow(2, attempt - 1) +
              Math.random() * 1000;
            setTimeout(attemptTask, delay);
          } else {
            this.updateStats(processingTime, false);
            this.emit("taskFailed", {
              taskId,
              attempts: attempt,
              error: lastError,
            });
            callback(lastError);
          }
        }
      };

      attemptTask();
    };
  }

  /**
   * Determine if an error should trigger a retry
   */
  shouldRetry(error) {
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

  /**
   * Update internal statistics
   */
  updateStats(processingTime, success) {
    if (success) {
      this.stats.processed++;
    } else {
      this.stats.failed++;
    }

    this.stats.totalProcessingTime += processingTime;
    this.processingTimes.push(processingTime);

    // Keep only recent processing times for rolling average
    if (this.processingTimes.length > this.maxProcessingTimesSamples) {
      this.processingTimes.shift();
    }

    // Calculate average processing time
    this.stats.avgProcessingTime =
      this.processingTimes.reduce((a, b) => a + b, 0) /
      this.processingTimes.length;

    // Update current load
    this.stats.currentLoad = this.queue.length() + this.queue.running();
    if (this.stats.currentLoad > this.stats.peakLoad) {
      this.stats.peakLoad = this.stats.currentLoad;
    }
  }

  /**
   * Set up monitoring and metrics emission
   */
  setupMonitoring() {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getMetrics();
      this.emit("metrics", metrics);
    }, this.options.metricsInterval);
  }

  /**
   * Set up adaptive concurrency based on queue performance
   */
  setupAdaptiveConcurrency() {
    this.adaptiveInterval = setInterval(() => {
      this.adjustConcurrency();
    }, this.options.metricsInterval);
  }

  /**
   * Adjust concurrency based on current performance metrics
   */
  adjustConcurrency() {
    const currentConcurrency = this.queue.concurrency;
    const queueLength = this.queue.length();
    const avgProcessingTime = this.stats.avgProcessingTime;
    const successRate =
      this.stats.processed / (this.stats.processed + this.stats.failed) || 1;

    let newConcurrency = currentConcurrency;

    // Increase concurrency if queue is building up and success rate is good
    if (
      queueLength > currentConcurrency * 2 &&
      successRate > 0.95 &&
      avgProcessingTime < 5000
    ) {
      newConcurrency = Math.min(
        currentConcurrency + 1,
        this.options.maxConcurrency
      );
    }
    // Decrease concurrency if processing is slow or error rate is high
    else if (avgProcessingTime > 10000 || successRate < 0.9) {
      newConcurrency = Math.max(
        currentConcurrency - 1,
        this.options.minConcurrency
      );
    }
    // Decrease concurrency if queue is empty for extended period
    else if (
      queueLength === 0 &&
      this.queue.running() < currentConcurrency / 2
    ) {
      newConcurrency = Math.max(
        currentConcurrency - 1,
        this.options.minConcurrency
      );
    }

    if (newConcurrency !== currentConcurrency) {
      this.queue.concurrency = newConcurrency;
      this.emit("concurrencyAdjusted", {
        oldConcurrency: currentConcurrency,
        newConcurrency,
        reason: { queueLength, avgProcessingTime, successRate },
      });
    }
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    const runtime = Date.now() - this.stats.startTime;
    const throughput = this.stats.processed / (runtime / 1000) || 0;

    return {
      ...this.stats,
      runtime,
      throughput,
      queueLength: this.queue.length(),
      running: this.queue.running(),
      concurrency: this.queue.concurrency,
      successRate:
        this.stats.processed / (this.stats.processed + this.stats.failed) || 1,
      utilization: this.queue.running() / this.queue.concurrency,
    };
  }

  /**
   * Add task to queue with priority support
   */
  push(task, priority = 0, callback) {
    if (typeof priority === "function") {
      callback = priority;
      priority = 0;
    }

    // Add priority and timestamp to task
    const enhancedTask = {
      ...task,
      _priority: priority,
      _queuedAt: Date.now(),
    };

    if (callback) {
      this.queue.push(enhancedTask, callback);
    } else {
      return new Promise((resolve, reject) => {
        this.queue.push(enhancedTask, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    }
  }

  /**
   * Add high priority task
   */
  unshift(task, callback) {
    return this.queue.unshift(task, callback);
  }

  /**
   * Pause the queue
   */
  pause() {
    this.queue.pause();
    this.emit("paused");
  }

  /**
   * Resume the queue
   */
  resume() {
    this.queue.resume();
    this.emit("resumed");
  }

  /**
   * Get queue status
   */
  status() {
    return {
      length: this.queue.length(),
      running: this.queue.running(),
      concurrency: this.queue.concurrency,
      paused: this.queue.paused,
      idle: this.queue.idle(),
    };
  }

  /**
   * Drain the queue and stop processing
   */
  async kill() {
    return new Promise((resolve) => {
      this.queue.kill();

      // Clean up intervals
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }
      if (this.adaptiveInterval) {
        clearInterval(this.adaptiveInterval);
      }

      this.emit("killed");
      resolve();
    });
  }

  /**
   * Wait for queue to become idle
   */
  async drain() {
    return new Promise((resolve) => {
      if (this.queue.idle()) {
        resolve();
      } else {
        const checkIdle = () => {
          if (this.queue.idle()) {
            resolve();
          } else {
            setTimeout(checkIdle, 100);
          }
        };
        checkIdle();
      }
    });
  }

  /**
   * Check if queue is idle
   */
  idle() {
    return this.queue.idle();
  }

  /**
   * Get queue length
   */
  length() {
    return this.queue.length();
  }

  /**
   * Get number of running tasks
   */
  running() {
    return this.queue.running();
  }

  /**
   * Set concurrency manually
   */
  setConcurrency(concurrency) {
    const oldConcurrency = this.queue.concurrency;
    this.queue.concurrency = Math.max(
      1,
      Math.min(concurrency, this.options.maxConcurrency)
    );

    if (oldConcurrency !== this.queue.concurrency) {
      this.emit("concurrencyChanged", {
        oldConcurrency,
        newConcurrency: this.queue.concurrency,
      });
    }
  }
}

module.exports = EnhancedQueue;
