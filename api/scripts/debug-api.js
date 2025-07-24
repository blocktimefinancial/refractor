#!/usr/bin/env node

const stellarSdk = require("@stellar/stellar-sdk");
const fetch = require("node-fetch");

// Simple test script to debug the API submission
async function debugAPISubmission() {
  console.log("🔍 Debug: Testing API submission format");

  // Create a simple transaction
  const keypair = stellarSdk.Keypair.fromSecret(
    "SAUEF4ICQXYY3VTJ2HYGHUOSX2EKC3X6OJGKRQDQUYJ5CJ4IIRVOMFJV"
  );
  const server = new stellarSdk.Horizon.Server(
    "https://horizon-testnet.stellar.org"
  );

  try {
    const account = await server.loadAccount(keypair.publicKey());

    const transaction = new stellarSdk.TransactionBuilder(account, {
      fee: stellarSdk.BASE_FEE,
      networkPassphrase: stellarSdk.Networks.TESTNET,
    })
      .addOperation(
        stellarSdk.Operation.payment({
          destination:
            "GABZZ7UPCCKBYQ7DYUGSKODS7222TGUBNHOY3LZT7JQ6MYTY2IUEKJK5",
          asset: stellarSdk.Asset.native(),
          amount: "0.1",
        })
      )
      .setTimeout(300)
      .build();

    const txHash = transaction.hash().toString("hex");
    const txXDR = transaction.toEnvelope().toXDR("base64");

    console.log("📋 Transaction details:");
    console.log("  Hash:", txHash);
    console.log("  XDR length:", txXDR.length);
    console.log("  XDR preview:", txXDR.substring(0, 50) + "...");

    // Test different payload formats
    const payloads = [
      {
        name: "Format 1: Basic with hash",
        payload: {
          hash: txHash,
          network: 1,
          xdr: txXDR,
        },
      },
      {
        name: "Format 2: Without hash",
        payload: {
          network: 1,
          xdr: txXDR,
        },
      },
      {
        name: "Format 3: String network",
        payload: {
          hash: txHash,
          network: "testnet",
          xdr: txXDR,
        },
      },
    ];

    for (const test of payloads) {
      console.log(`\n🧪 Testing ${test.name}:`);
      console.log("  Payload:", JSON.stringify(test.payload, null, 2));

      try {
        const response = await fetch("http://localhost:4010/tx", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(test.payload),
        });

        console.log(
          `  Response status: ${response.status} ${response.statusText}`
        );

        const responseText = await response.text();
        console.log("  Response body:", responseText);

        if (response.ok) {
          console.log("  ✅ SUCCESS!");
          break;
        } else {
          console.log("  ❌ FAILED");
        }
      } catch (error) {
        console.log(`  ❌ ERROR: ${error.message}`);
      }
    }
  } catch (error) {
    console.error("❌ Failed to create transaction:", error.message);
  }
}

debugAPISubmission().catch(console.error);
