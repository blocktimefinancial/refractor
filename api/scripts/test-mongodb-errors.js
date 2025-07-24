#!/usr/bin/env node

const mongoose = require("mongoose");

/**
 * Test script to verify MongoDB update operations with $inc operator
 */
async function testMongoDbOperations() {
  console.log("🔍 Testing MongoDB update operations...");

  try {
    // Connect to MongoDB
    await mongoose.connect("mongodb://localhost:27017/refractor", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // Define a simple test schema
    const testSchema = new mongoose.Schema({
      _id: String,
      status: String,
      lastError: String,
      retryCount: { type: Number, default: 0 },
      updatedAt: Date,
    });

    const TestModel = mongoose.model(
      "TestTransaction",
      testSchema,
      "test_transactions"
    );

    // Clean up any existing test data
    await TestModel.deleteMany({ _id: { $regex: /^test_/ } });
    console.log("🧹 Cleaned up existing test data");

    // Create a test document
    const testDoc = new TestModel({
      _id: "test_error_handling_doc",
      status: "processing",
      retryCount: 5,
      updatedAt: new Date(),
    });
    await testDoc.save();
    console.log("✅ Created test document");

    // Test the update operation that our finalizer uses
    const testError = new Error("Test error for database update");
    const update = {
      status: "failed",
      updatedAt: new Date(),
    };

    if (testError) {
      update.lastError = testError.message || testError.toString();
      update.$inc = { retryCount: 1 };
    }

    console.log("📝 Update operation to be executed:");
    console.log(JSON.stringify(update, null, 2));

    // Execute the update
    const result = await TestModel.updateOne(
      { _id: "test_error_handling_doc", status: "processing" },
      update
    );

    console.log("📊 Update result:", {
      acknowledged: result.acknowledged,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    });

    // Verify the document was updated correctly
    const updatedDoc = await TestModel.findById("test_error_handling_doc");
    console.log("📊 Updated document:");
    console.log({
      _id: updatedDoc._id,
      status: updatedDoc.status,
      lastError: updatedDoc.lastError,
      retryCount: updatedDoc.retryCount,
      updatedAt: updatedDoc.updatedAt,
    });

    // Test edge cases
    console.log("\n🧪 Testing edge cases...");

    // Test with null error
    console.log("📝 Test 1: Update without error");
    await TestModel.updateOne(
      { _id: "test_error_handling_doc" },
      {
        status: "ready",
        updatedAt: new Date(),
      }
    );

    const docAfterNullError = await TestModel.findById(
      "test_error_handling_doc"
    );
    console.log("📊 Document after update without error:", {
      status: docAfterNullError.status,
      lastError: docAfterNullError.lastError,
      retryCount: docAfterNullError.retryCount,
    });

    // Test with string error
    console.log("\n📝 Test 2: Update with string error");
    const stringError = "String error message";
    const stringUpdate = {
      status: "failed",
      lastError: stringError,
      $inc: { retryCount: 1 },
      updatedAt: new Date(),
    };

    await TestModel.updateOne({ _id: "test_error_handling_doc" }, stringUpdate);

    const docAfterStringError = await TestModel.findById(
      "test_error_handling_doc"
    );
    console.log("📊 Document after string error update:", {
      status: docAfterStringError.status,
      lastError: docAfterStringError.lastError,
      retryCount: docAfterStringError.retryCount,
    });

    // Clean up
    await TestModel.deleteOne({ _id: "test_error_handling_doc" });
    console.log("🧹 Cleaned up test document");

    console.log("\n✅ All MongoDB update tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  }
}

// Test the MongooseDataProvider updateTxStatus method specifically
async function testMongooseDataProviderMethod() {
  console.log("\n🔍 Testing MongooseDataProvider.updateTxStatus method...");

  try {
    const {
      MongooseDataProvider,
    } = require("../storage/mongoose-data-provider");
    const provider = new MongooseDataProvider();

    await provider.connect();
    console.log("✅ Connected via MongooseDataProvider");

    // Create a test transaction
    const testTx = {
      hash: "test_updatetxstatus_method",
      network: 1,
      xdr: "test-xdr-data",
      signatures: [],
      status: "ready",
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      minTime: Math.floor(Date.now() / 1000),
    };

    await provider.createTransaction(testTx);
    console.log("✅ Created test transaction");

    // Test updateTxStatus with error
    const testError = new Error("MongooseDataProvider test error");
    testError.stack = "Test stack trace for MongooseDataProvider";

    console.log("📝 Calling updateTxStatus with error...");
    const success = await provider.updateTxStatus(
      "test_updatetxstatus_method",
      "failed",
      "ready",
      testError
    );

    console.log("📊 updateTxStatus returned:", success);

    // Verify the result
    const updatedTx = await provider.findTransaction(
      "test_updatetxstatus_method"
    );
    console.log("📊 Updated transaction:", {
      hash: updatedTx.hash,
      status: updatedTx.status,
      lastError: updatedTx.lastError,
      retryCount: updatedTx.retryCount,
    });

    // Clean up
    await provider.removeTransaction("test_updatetxstatus_method");
    console.log("🧹 Cleaned up test transaction");

    await provider.disconnect();
    console.log("✅ Disconnected from MongooseDataProvider");

    console.log("\n✅ MongooseDataProvider.updateTxStatus test passed!");
  } catch (error) {
    console.error("❌ MongooseDataProvider test failed:", error.message);
    console.error(error.stack);
  }
}

async function runAllTests() {
  console.log("=".repeat(60));
  console.log("🧪 MONGODB ERROR HANDLING TEST SUITE");
  console.log("=".repeat(60));

  await testMongoDbOperations();
  await testMongooseDataProviderMethod();

  console.log("\n" + "=".repeat(60));
  console.log("✅ All MongoDB tests completed");
  console.log("=".repeat(60));
}

// Run the tests
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error("❌ Test suite failed:", error);
    process.exit(1);
  });
}

module.exports = { testMongoDbOperations, testMongooseDataProviderMethod };
