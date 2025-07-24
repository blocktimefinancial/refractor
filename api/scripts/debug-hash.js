#!/usr/bin/env node

/**
 * Debug script to understand the hash mismatch issue
 */

const axios = require("axios");
const stellarSdk = require("@stellar/stellar-sdk");

async function debugHashIssue() {
  console.log("🔍 Debugging hash mismatch issue...\n");

  // Generate a simple transaction
  const sourceKeypair = stellarSdk.Keypair.random();
  const destinationKeypair = stellarSdk.Keypair.random();
  const sourceAccount = new stellarSdk.Account(sourceKeypair.publicKey(), "0");

  const transaction = new stellarSdk.TransactionBuilder(sourceAccount, {
    fee: stellarSdk.BASE_FEE,
    networkPassphrase: stellarSdk.Networks.TESTNET,
  })
    .addOperation(
      stellarSdk.Operation.payment({
        destination: destinationKeypair.publicKey(),
        asset: stellarSdk.Asset.native(),
        amount: "1",
      })
    )
    .setTimeout(300)
    .build();

  const originalHash = transaction.hash().toString("hex");
  const originalXDR = transaction.toXDR();

  console.log("📝 Original transaction:");
  console.log(`  Hash: ${originalHash}`);
  console.log(`  XDR length: ${originalXDR.length}`);
  console.log(`  Has signatures: ${transaction.signatures.length > 0}`);

  // Submit to API
  const submissionData = {
    hash: originalHash,
    network: 1, // testnet
    xdr: originalXDR,
    signatures: [],
    submit: false,
    callbackUrl: null,
    desiredSigners: [],
    minTime: 0,
    maxTime: Math.floor(Date.now() / 1000) + 3600,
  };

  try {
    console.log("\n📤 Submitting to API...");
    const submitResponse = await axios.post(
      "http://localhost:4010/tx",
      submissionData,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    console.log("✅ Submission successful:");
    console.log(`  Returned hash: ${submitResponse.data.hash}`);
    console.log(
      `  Matches original: ${submitResponse.data.hash === originalHash}`
    );

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Retrieve from API
    console.log("\n📥 Retrieving from API...");
    const retrieveResponse = await axios.get(
      `http://localhost:4010/tx/${originalHash}`,
      {
        timeout: 10000,
      }
    );

    console.log("✅ Retrieval successful:");
    console.log(`  Returned hash: ${retrieveResponse.data.hash}`);
    console.log(
      `  Matches original: ${retrieveResponse.data.hash === originalHash}`
    );
    console.log(`  XDR length: ${retrieveResponse.data.xdr.length}`);

    // Check if returned XDR hash matches
    try {
      const returnedTx = stellarSdk.TransactionBuilder.fromXDR(
        retrieveResponse.data.xdr,
        stellarSdk.Networks.TESTNET
      );
      const returnedHash = returnedTx.hash().toString("hex");
      console.log(`  XDR-calculated hash: ${returnedHash}`);
      console.log(
        `  XDR hash matches original: ${returnedHash === originalHash}`
      );
      console.log(
        `  Returned XDR has signatures: ${returnedTx.signatures.length > 0}`
      );
    } catch (error) {
      console.log(`  Error parsing returned XDR: ${error.message}`);
    }
  } catch (error) {
    console.error("❌ Test failed:");
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Error: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`  Error: ${error.message}`);
    }
  }
}

debugHashIssue().catch(console.error);
