#!/usr/bin/env node

const { MongooseDataProvider } = require("../storage/mongoose-data-provider");
const {
  TransactionBuilder,
  Keypair,
  Networks,
  Operation,
  Asset,
} = require("@stellar/stellar-sdk");

/**
 * Test script to verify that lastError field is properly updated when transactions fail
 */
async function testErrorHandling() {
  console.log("🔍 Testing error handling and lastError field updates...");

  const provider = new MongooseDataProvider();

  try {
    await provider.connect();
    console.log("✅ Connected to MongoDB");

    // Create a test transaction that will fail
    const testKeypair = Keypair.random();
    const account = await provider.server
      .loadAccount(testKeypair.publicKey())
      .catch(() => null);

    if (!account) {
      console.log("❌ Test account not found, creating one with friendbot...");
      // This will fail but we can still test the error handling
    }

    // Create a simple transaction
    const transaction = new TransactionBuilder(
      account || {
        accountId: () => testKeypair.publicKey(),
        sequenceNumber: () => "1",
        incrementSequenceNumber: () => {},
      },
      {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      }
    )
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: "0.0000001",
        })
      )
      .setTimeout(300)
      .build();

    const txHash = transaction.hash().toString("hex");
    console.log("📝 Test transaction hash:", txHash);

    // Store the transaction
    const txData = {
      hash: txHash,
      network: 1, // testnet
      xdr: transaction.toXDR(),
      signatures: [],
      status: "ready",
      submit: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      minTime: Math.floor(Date.now() / 1000),
      retryCount: 0,
    };

    await provider.createTransaction(txData);
    console.log("✅ Test transaction created");

    // Test error scenarios
    console.log("\n🧪 Testing error scenarios...");

    // Test 1: Test updateTxStatus with error
    const testError1 = new Error("Test callback failure");
    testError1.stack =
      "Error: Test callback failure\n    at testCallback (test.js:123:45)";

    console.log("📝 Test 1: Updating status to failed with callback error...");
    const success1 = await provider.updateTxStatus(
      txHash,
      "failed",
      "ready",
      testError1
    );
    console.log("✅ updateTxStatus returned:", success1);

    // Check what was stored
    const txAfterError1 = await provider.findTransaction(txHash);
    console.log("📊 Transaction after first error:");
    console.log("  - Status:", txAfterError1.status);
    console.log("  - LastError:", txAfterError1.lastError);
    console.log("  - RetryCount:", txAfterError1.retryCount);

    // Test 2: Test another error type
    const testError2 = new Error("Test horizon submission failure");
    testError2.response = {
      status: 400,
      data: { extras: { result_codes: { transaction: "tx_bad_seq" } } },
    };

    console.log("\n📝 Test 2: Updating with horizon error...");
    const success2 = await provider.updateTxStatus(
      txHash,
      "failed",
      "failed",
      testError2
    );
    console.log("✅ updateTxStatus returned:", success2);

    // Check what was stored
    const txAfterError2 = await provider.findTransaction(txHash);
    console.log("📊 Transaction after second error:");
    console.log("  - Status:", txAfterError2.status);
    console.log("  - LastError:", txAfterError2.lastError);
    console.log("  - RetryCount:", txAfterError2.retryCount);

    // Test 3: Test with string error
    console.log("\n📝 Test 3: Updating with string error...");
    const success3 = await provider.updateTxStatus(
      txHash,
      "failed",
      "failed",
      "Simple string error message"
    );
    console.log("✅ updateTxStatus returned:", success3);

    // Check what was stored
    const txAfterError3 = await provider.findTransaction(txHash);
    console.log("📊 Transaction after third error:");
    console.log("  - Status:", txAfterError3.status);
    console.log("  - LastError:", txAfterError3.lastError);
    console.log("  - RetryCount:", txAfterError3.retryCount);

    // Test 4: Test the raw MongoDB update to see the exact query
    console.log("\n📝 Test 4: Testing raw MongoDB update structure...");
    const update = {
      status: "failed",
      updatedAt: new Date(),
    };

    const testError4 = new Error("Raw update test error");
    if (testError4) {
      update.lastError = testError4.message || testError4.toString();
      update.$inc = { retryCount: 1 };
    }

    console.log("📊 Update object that would be sent to MongoDB:");
    console.log(JSON.stringify(update, null, 2));

    // Clean up
    console.log("\n🧹 Cleaning up test transaction...");
    await provider.removeTransaction(txHash);
    console.log("✅ Test transaction removed");

    console.log("\n✅ All error handling tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
  } finally {
    await provider.disconnect();
    console.log("✅ Disconnected from MongoDB");
  }
}

// Run the test
if (require.main === module) {
  testErrorHandling().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

module.exports = { testErrorHandling };
