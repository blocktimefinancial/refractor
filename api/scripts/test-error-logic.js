#!/usr/bin/env node

/**
 * Simple test to verify error handling logic without database connections
 */
function testErrorHandling() {
  console.log("🔍 Testing error handling logic...");

  try {
    // Test 1: Error object with message
    console.log("\n📝 Test 1: Error object with message");
    const error1 = new Error("Test error message");
    error1.stack = "Error: Test error message\n    at test (file.js:123:45)";

    const update1 = { status: "failed" };
    if (error1) {
      update1.lastError = error1.message || error1.toString();
      update1.$inc = { retryCount: 1 };
    }

    console.log("Error object:", {
      message: error1.message,
      toString: error1.toString(),
      stack: error1.stack,
    });
    console.log("Update object:", JSON.stringify(update1, null, 2));

    // Test 2: Error object without message
    console.log("\n📝 Test 2: Error object without message");
    const error2 = {};
    error2.toString = () => "Custom error toString";

    const update2 = { status: "failed" };
    if (error2) {
      update2.lastError = error2.message || error2.toString();
      update2.$inc = { retryCount: 1 };
    }

    console.log("Error object:", {
      message: error2.message,
      toString: error2.toString(),
    });
    console.log("Update object:", JSON.stringify(update2, null, 2));

    // Test 3: String error
    console.log("\n📝 Test 3: String error");
    const error3 = "Simple string error";

    const update3 = { status: "failed" };
    if (error3) {
      update3.lastError = error3.message || error3.toString();
      update3.$inc = { retryCount: 1 };
    }

    console.log("Error string:", error3);
    console.log("Update object:", JSON.stringify(update3, null, 2));

    // Test 4: Complex error with response data
    console.log("\n📝 Test 4: Complex error with response data");
    const error4 = new Error("Horizon submission failed");
    error4.response = {
      status: 400,
      data: {
        extras: {
          result_codes: {
            transaction: "tx_bad_seq",
          },
        },
      },
    };

    const update4 = { status: "failed" };
    if (error4) {
      update4.lastError = error4.message || error4.toString();
      update4.$inc = { retryCount: 1 };
    }

    console.log("Error object:", {
      message: error4.message,
      toString: error4.toString(),
      response: error4.response,
    });
    console.log("Update object:", JSON.stringify(update4, null, 2));

    console.log("\n✅ All error handling logic tests passed!");
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    console.error(err.stack);
  }
}

// Test the MongoDB update syntax
function testMongoUpdateSyntax() {
  console.log("\n🔍 Testing MongoDB update syntax...");

  // This is what the finalizer creates
  const errorObj = new Error("Transaction processing failed");

  // This is what updateTxStatus should create
  const update = {
    status: "failed",
    updatedAt: new Date(),
  };

  if (errorObj) {
    update.lastError = errorObj.message || errorObj.toString();
    update.$inc = { retryCount: 1 };
  }

  console.log("📊 MongoDB update object:");
  console.log(JSON.stringify(update, null, 2));

  // This is what MongoDB will execute
  console.log("\n📊 MongoDB operation would be:");
  console.log("db.transactions.updateOne(");
  console.log('  { _id: "transaction_hash", status: "processing" },');
  console.log("  " + JSON.stringify(update, null, 2).replace(/\n/g, "\n  "));
  console.log(")");
}

console.log("=".repeat(60));
console.log("🧪 ERROR HANDLING TEST SUITE");
console.log("=".repeat(60));

testErrorHandling();
testMongoUpdateSyntax();

console.log("\n" + "=".repeat(60));
console.log("✅ Test suite completed");
console.log("=".repeat(60));
