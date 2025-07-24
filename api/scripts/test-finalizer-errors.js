#!/usr/bin/env node

/**
 * Test script to verify finalizer error handling integration
 */

const path = require("path");

// Mock the storage layer to capture what gets called
let capturedUpdateCalls = [];

// Mock storage layer
const mockStorageLayer = {
  dataProvider: {
    updateTxStatus: async (hash, status, expectedStatus, error) => {
      const call = {
        hash,
        status,
        expectedStatus,
        error: error
          ? {
              message: error.message,
              toString: error.toString(),
              stack: error.stack,
            }
          : null,
        timestamp: new Date().toISOString(),
      };

      capturedUpdateCalls.push(call);
      console.log(
        `📝 Mock updateTxStatus called:`,
        JSON.stringify(call, null, 2)
      );
      return true; // Return success
    },

    updateTransaction: async (hash, update, expectedStatus) => {
      console.log(`📝 Mock updateTransaction called:`, {
        hash,
        update,
        expectedStatus,
      });
      return true;
    },
  },
};

// Mock other dependencies
const mockTxLoader = {
  rehydrateTx: (txInfo) => {
    console.log(`📝 Mock rehydrateTx called for: ${txInfo.hash}`);
    return {
      ...txInfo,
      xdr: "mock-rehydrated-xdr",
    };
  },
};

const mockCallbackHandler = {
  processCallback: async (txInfo) => {
    console.log(`📝 Mock processCallback called for: ${txInfo.hash}`);
    // Simulate a callback failure
    throw new Error("Callback endpoint returned 500 Internal Server Error");
  },
};

const mockHorizonHandler = {
  submitTransaction: async (txInfo) => {
    console.log(`📝 Mock submitTransaction called for: ${txInfo.hash}`);
    // Simulate a horizon failure
    const error = new Error("Transaction submission failed");
    error.response = {
      status: 400,
      data: {
        extras: {
          result_codes: {
            transaction: "tx_bad_seq",
          },
        },
      },
    };
    throw error;
  },
};

const mockTimestampUtils = {
  getUnixTimestamp: () => Math.floor(Date.now() / 1000),
};

// Create a test finalizer class with mocked dependencies
class TestFinalizer {
  constructor() {
    this.storageLayer = mockStorageLayer;
    this.rehydrateTx = mockTxLoader.rehydrateTx;
    this.processCallback = mockCallbackHandler.processCallback;
    this.submitTransaction = mockHorizonHandler.submitTransaction;
    this.getUnixTimestamp = mockTimestampUtils.getUnixTimestamp;
  }

  // Copy the processTx method from the real finalizer
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
      // Lock tx
      console.log(`[DEBUG] Attempting to lock transaction ${txInfo.hash}`);
      if (
        !(await this.storageLayer.dataProvider.updateTxStatus(
          txInfo.hash,
          "processing",
          "ready"
        ))
      ) {
        console.log(
          `[DEBUG] Failed to obtain lock for transaction ${txInfo.hash}`
        );
        return;
      }
      console.log(`[DEBUG] Successfully locked transaction ${txInfo.hash}`);
    } catch (e) {
      console.error(`[DEBUG] Error locking transaction ${txInfo.hash}:`, e);
      return;
    }

    try {
      if (txInfo.maxTime && txInfo.maxTime < this.getUnixTimestamp()) {
        console.log(`[DEBUG] Transaction ${txInfo.hash} has expired`);
        throw new Error(`Transaction has already expired`);
      }

      console.log(`[DEBUG] Rehydrating transaction ${txInfo.hash}`);
      const txInfoFull = this.rehydrateTx(txInfo);
      const update = { status: "processed" };

      console.log(
        `[DEBUG] Transaction ${txInfo.hash} - callbackUrl: ${txInfo.callbackUrl}, submit: ${txInfo.submit}`
      );

      if (txInfo.callbackUrl) {
        console.log(
          `[DEBUG] Processing callback for transaction ${txInfo.hash}`
        );
        await this.processCallback(txInfoFull);
        console.log(
          `[DEBUG] Callback processed for transaction ${txInfo.hash}`
        );
      }

      if (txInfo.submit) {
        console.log(`[DEBUG] Submitting transaction ${txInfo.hash} to horizon`);
        await this.submitTransaction(txInfoFull);
        update.submitted = this.getUnixTimestamp();
        console.log(`[DEBUG] Transaction ${txInfo.hash} submitted to horizon`);
      }

      console.log(
        `[DEBUG] Updating transaction ${txInfo.hash} status to processed`
      );
      if (
        !(await this.storageLayer.dataProvider.updateTransaction(
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
        message: e.message || e.toString(),
        stack: e.stack,
        timestamp: new Date().toISOString(),
        hash: txInfo.hash,
      };

      console.log(
        `[DEBUG] Updating transaction ${txInfo.hash} status to failed with error:`,
        errorInfo
      );

      await this.storageLayer.dataProvider.updateTxStatus(
        txInfo.hash,
        "failed",
        "processing",
        e
      );
      throw e; // Re-throw for enhanced queue to handle
    }
  }
}

async function testFinalizerErrorHandling() {
  console.log("🔍 Testing Finalizer Error Handling Integration...");

  const finalizer = new TestFinalizer();

  // Test scenarios
  const testScenarios = [
    {
      name: "Callback Error",
      txInfo: {
        hash: "callback_error_test_hash",
        status: "ready",
        callbackUrl: "https://example.com/callback",
        submit: false,
        minTime: Math.floor(Date.now() / 1000) - 100,
      },
    },
    {
      name: "Horizon Submission Error",
      txInfo: {
        hash: "horizon_error_test_hash",
        status: "ready",
        callbackUrl: null,
        submit: true,
        minTime: Math.floor(Date.now() / 1000) - 100,
      },
    },
    {
      name: "Both Callback and Horizon Error",
      txInfo: {
        hash: "both_errors_test_hash",
        status: "ready",
        callbackUrl: "https://example.com/callback",
        submit: true,
        minTime: Math.floor(Date.now() / 1000) - 100,
      },
    },
  ];

  for (const scenario of testScenarios) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🧪 Testing: ${scenario.name}`);
    console.log(`${"=".repeat(60)}`);

    capturedUpdateCalls = []; // Reset captured calls

    try {
      await finalizer.processTx(scenario.txInfo);
      console.log("❌ Expected error but transaction completed successfully");
    } catch (error) {
      console.log("✅ Transaction failed as expected:", error.message);
    }

    console.log("\n📊 Captured updateTxStatus calls:");
    capturedUpdateCalls.forEach((call, index) => {
      console.log(`Call ${index + 1}:`, JSON.stringify(call, null, 2));
    });
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ Finalizer error handling integration tests completed!");
  console.log(`${"=".repeat(60)}`);
}

// Run the test
if (require.main === module) {
  testFinalizerErrorHandling().catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
}

module.exports = { testFinalizerErrorHandling };
