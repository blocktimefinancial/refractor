const express = require("express");
const finalizer = require("../business-logic/finalization/finalizer");
const storageLayer = require("../storage/storage-layer");

const router = express.Router();

/**
 * Get queue metrics and status
 */
router.get("/metrics", async (req, res) => {
  try {
    const finalizerMetrics = finalizer.getQueueMetrics();
    const finalizerStatus = finalizer.getQueueStatus();

    // Get database statistics if using Mongoose
    let dbStats = null;
    if (storageLayer.dataProvider.getTransactionStats) {
      dbStats = await storageLayer.dataProvider.getTransactionStats();
    }

    res.json({
      finalizer: {
        metrics: finalizerMetrics,
        status: finalizerStatus,
      },
      database: dbStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting metrics:", error);
    res.status(500).json({ error: "Failed to get metrics" });
  }
});

/**
 * Get health check status
 */
router.get("/health", async (req, res) => {
  try {
    const status = finalizer.getQueueStatus();
    const isHealthy =
      !status.paused && status.concurrency > 0 && storageLayer.dataProvider;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "healthy" : "unhealthy",
      queue: status,
      database: !!storageLayer.dataProvider,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in health check:", error);
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Pause queue processing
 */
router.post("/queue/pause", (req, res) => {
  try {
    finalizer.finalizerQueue.pause();
    res.json({ message: "Queue paused", status: finalizer.getQueueStatus() });
  } catch (error) {
    res.status(500).json({ error: "Failed to pause queue" });
  }
});

/**
 * Resume queue processing
 */
router.post("/queue/resume", (req, res) => {
  try {
    finalizer.finalizerQueue.resume();
    res.json({ message: "Queue resumed", status: finalizer.getQueueStatus() });
  } catch (error) {
    res.status(500).json({ error: "Failed to resume queue" });
  }
});

/**
 * Adjust queue concurrency
 */
router.post("/queue/concurrency", (req, res) => {
  try {
    const { concurrency } = req.body;

    if (!concurrency || concurrency < 1 || concurrency > 100) {
      return res
        .status(400)
        .json({ error: "Invalid concurrency value (1-100)" });
    }

    finalizer.setQueueConcurrency(parseInt(concurrency));
    res.json({
      message: "Concurrency updated",
      concurrency: parseInt(concurrency),
      status: finalizer.getQueueStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update concurrency" });
  }
});

/**
 * Clean up expired transactions
 */
router.post("/cleanup/expired", async (req, res) => {
  try {
    if (!storageLayer.dataProvider.cleanupExpiredTransactions) {
      return res
        .status(501)
        .json({ error: "Cleanup not supported by current data provider" });
    }

    const cleanedCount =
      await storageLayer.dataProvider.cleanupExpiredTransactions();
    res.json({
      message: "Cleanup completed",
      cleanedTransactions: cleanedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error during cleanup:", error);
    res.status(500).json({ error: "Cleanup failed" });
  }
});

module.exports = router;
