#!/usr/bin/env node

const stellarSdk = require("@stellar/stellar-sdk");
// Use built-in fetch in Node.js 18+
const fetch = global.fetch || require("node-fetch");
const { Keypair, TransactionBuilder, Networks, Operation, Asset } = stellarSdk;

// Test account credentials from testkeys.txt
const ACCOUNT_1 = {
  publicKey: "GBUAYLIOV6JSXJ62WAKHTQEV36NVOA4JBF2ONE4FNR5LDPZUBGTOYBXB",
  secretKey: "SDF5UKOD5YFOAUIR7O3UA4C4PUFWABHMAJQCI7KOBS5WQT7VUHNG5FCT",
};

const ACCOUNT_2 = {
  publicKey: "GABZZ7UPCCKBYQ7DYUGSKODS7222TGUBNHOY3LZT7JQ6MYTY2IUEKJK5",
  secretKey: "SAUEF4ICQXYY3VTJ2HYGHUOSX2EKC3X6OJGKRQDQUYJ5CJ4IIRVOMFJV",
};

// Configuration
const API_BASE_URL = "http://localhost:4010";
const HORIZON_SERVER = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const PAYMENT_AMOUNT = "1.0000000"; // 1 XLM

class StellarPaymentTester {
  constructor() {
    this.server = new stellarSdk.Horizon.Server(HORIZON_SERVER);
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  async checkAccountExists(publicKey) {
    try {
      const account = await this.server.loadAccount(publicKey);
      this.log(`✅ Account ${publicKey.substr(0, 8)}... exists`);
      return { exists: true, account };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.log(`❌ Account ${publicKey.substr(0, 8)}... does not exist`);
        return { exists: false, error: "Account not found" };
      }
      throw error;
    }
  }

  async createAccount(publicKey) {
    this.log(
      `🔧 Creating account ${publicKey.substr(0, 8)}... using Friendbot`
    );
    try {
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
      );

      if (response.ok) {
        this.log(
          `✅ Account ${publicKey.substr(0, 8)}... created successfully`
        );
        // Wait a bit for the account to be available
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return true;
      } else {
        this.log(
          `❌ Failed to create account: ${response.status} ${response.statusText}`
        );
        return false;
      }
    } catch (error) {
      this.log(`❌ Error creating account: ${error.message}`);
      return false;
    }
  }

  async ensureAccountExists(publicKey) {
    const accountCheck = await this.checkAccountExists(publicKey);
    if (!accountCheck.exists) {
      const created = await this.createAccount(publicKey);
      if (!created) {
        throw new Error(`Failed to create account ${publicKey}`);
      }
      // Re-check after creation
      const recheckResult = await this.checkAccountExists(publicKey);
      return recheckResult.account;
    }
    return accountCheck.account;
  }

  async createPaymentTransaction() {
    this.log("🏗️  Creating payment transaction...");

    // Ensure both accounts exist
    const sourceAccount = await this.ensureAccountExists(ACCOUNT_1.publicKey);
    await this.ensureAccountExists(ACCOUNT_2.publicKey);

    // Create the payment transaction
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: stellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: ACCOUNT_2.publicKey,
          asset: Asset.native(),
          amount: PAYMENT_AMOUNT,
        })
      )
      .addMemo(stellarSdk.Memo.text("Refractor API Test Payment"))
      .setTimeout(300) // 5 minutes timeout
      .build();

    const txHash = transaction.hash().toString("hex");
    const txXDR = transaction.toEnvelope().toXDR("base64");

    this.log(`✅ Transaction created:`, {
      hash: txHash,
      source: ACCOUNT_1.publicKey,
      destination: ACCOUNT_2.publicKey,
      amount: PAYMENT_AMOUNT + " XLM",
    });

    return { transaction, txHash, txXDR };
  }

  async submitToRefractor(txXDR, txHash, submit = false) {
    this.log("📤 Submitting transaction to Refractor API...");

    const payload = {
      hash: txHash,
      network: 1, // 0 = mainnet, 1 = testnet
      xdr: txXDR,
      submit: submit,
      callbackUrl: null,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/tx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      this.log("✅ Transaction submitted to Refractor:", {
        hash: result.hash,
        status: result.status,
        network: result.network,
      });

      return result;
    } catch (error) {
      this.log(`❌ Failed to submit to Refractor: ${error.message}`);
      throw error;
    }
  }

  async retrieveFromRefractor(txHash) {
    this.log(
      `🔍 Retrieving transaction ${txHash.substr(0, 8)}... from Refractor...`
    );

    try {
      const response = await fetch(`${API_BASE_URL}/tx/${txHash}`);

      if (!response.ok) {
        if (response.status === 404) {
          this.log("❌ Transaction not found in Refractor");
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      this.log("✅ Transaction retrieved from Refractor:", {
        hash: result.hash,
        status: result.status,
        signatures: result.signatures?.length || 0,
        readyToSubmit: result.readyToSubmit,
      });

      return result;
    } catch (error) {
      this.log(`❌ Failed to retrieve from Refractor: ${error.message}`);
      throw error;
    }
  }

  async signTransaction(txXDR, secretKey) {
    this.log("✍️  Signing transaction...");

    try {
      const keypair = Keypair.fromSecret(secretKey);
      const transaction = new stellarSdk.Transaction(txXDR, NETWORK_PASSPHRASE);

      // Sign the transaction
      transaction.sign(keypair);

      const signedXDR = transaction.toEnvelope().toXDR("base64");

      this.log(
        `✅ Transaction signed by ${keypair.publicKey().substr(0, 8)}...`
      );

      return signedXDR;
    } catch (error) {
      this.log(`❌ Failed to sign transaction: ${error.message}`);
      throw error;
    }
  }

  async submitSignedTransaction(signedXDR, txHash) {
    this.log("📤 Submitting signed transaction to Refractor...");

    const payload = {
      hash: txHash,
      network: 1, // 0 = mainnet, 1 = testnet
      xdr: signedXDR,
      submit: true, // Auto-submit once fully signed
    };

    try {
      const response = await fetch(`${API_BASE_URL}/tx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      this.log("✅ Signed transaction submitted:", {
        hash: result.hash,
        status: result.status,
        readyToSubmit: result.readyToSubmit,
        signatures: result.signatures?.length || 0,
      });

      return result;
    } catch (error) {
      this.log(`❌ Failed to submit signed transaction: ${error.message}`);
      throw error;
    }
  }

  async waitForProcessing(txHash, maxWaitTime = 60000) {
    this.log(
      `⏳ Waiting for transaction processing (max ${maxWaitTime / 1000}s)...`
    );

    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const txInfo = await this.retrieveFromRefractor(txHash);

      if (
        txInfo &&
        (txInfo.status === "processed" || txInfo.status === "failed")
      ) {
        this.log(
          `✅ Transaction processing completed with status: ${txInfo.status}`
        );
        return txInfo;
      }

      // Wait 2 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    this.log("⚠️  Timeout waiting for transaction processing");
    return null;
  }

  async verifyOnHorizon(txHash) {
    this.log(`🔍 Verifying transaction on Horizon...`);

    try {
      const txRecord = await this.server
        .transactions()
        .transaction(txHash)
        .call();

      this.log("✅ Transaction found on Horizon:", {
        hash: txRecord.hash,
        successful: txRecord.successful,
        ledger: txRecord.ledger,
        created_at: txRecord.created_at,
      });

      return txRecord;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.log("❌ Transaction not found on Horizon");
        return null;
      }
      this.log(`❌ Error verifying on Horizon: ${error.message}`);
      throw error;
    }
  }

  async runFullTest() {
    this.log("🚀 Starting Stellar Payment Test via Refractor API");
    this.log("============================================================");

    try {
      // Step 1: Create the payment transaction
      const { transaction, txHash, txXDR } =
        await this.createPaymentTransaction();

      // Step 2: Submit unsigned transaction to Refractor
      const refractorResult = await this.submitToRefractor(
        txXDR,
        txHash,
        false
      );

      // Step 3: Retrieve transaction from Refractor to verify storage
      await this.retrieveFromRefractor(txHash);

      // Step 4: Sign the transaction
      const signedXDR = await this.signTransaction(txXDR, ACCOUNT_1.secretKey);

      // Step 5: Submit signed transaction to Refractor
      const signedResult = await this.submitSignedTransaction(
        signedXDR,
        txHash
      );

      // Step 6: Wait for processing
      const finalStatus = await this.waitForProcessing(txHash);

      // Step 7: Verify on Horizon (if processed)
      if (finalStatus && finalStatus.status === "processed") {
        await this.verifyOnHorizon(txHash);
      }

      this.log("🎉 Payment test completed successfully!");
      this.log("============================================================");

      return {
        success: true,
        txHash,
        finalStatus,
      };
    } catch (error) {
      this.log(`❌ Payment test failed: ${error.message}`);
      this.log("============================================================");

      return {
        success: false,
        error: error.message,
      };
    }
  }

  async testWithSubmit() {
    this.log("🚀 Starting Stellar Payment Test with Horizon Submission");
    this.log("============================================================");

    try {
      // Step 1: Create the payment transaction
      const { transaction, txHash, txXDR } =
        await this.createPaymentTransaction();

      // Step 2: Sign the transaction immediately
      const signedXDR = await this.signTransaction(txXDR, ACCOUNT_1.secretKey);

      // Step 3: Submit signed transaction with submit=true
      this.log("📤 Submitting fully signed transaction with submit=true...");
      const payload = {
        hash: txHash,
        network: 1, // 0 = mainnet, 1 = testnet
        xdr: signedXDR,
        submit: true, // This will trigger immediate submission to Horizon
        callbackUrl: null,
      };

      const response = await fetch(`${API_BASE_URL}/tx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      this.log("✅ Transaction submitted to Refractor with submit=true:", {
        hash: result.hash,
        status: result.status,
        network: result.network,
        readyToSubmit: result.readyToSubmit,
      });

      // Step 4: Wait for processing and submission
      this.log("⏳ Waiting for processing and Horizon submission...");
      const finalStatus = await this.waitForProcessing(txHash, 120000); // 2 minutes

      // Step 5: Verify final status
      if (finalStatus) {
        this.log("✅ Final transaction status:", {
          status: finalStatus.status,
          submitted: finalStatus.submitted,
          submittedAt: finalStatus.submitted
            ? new Date(finalStatus.submitted * 1000).toISOString()
            : null,
        });

        // Step 6: Verify on Horizon
        if (finalStatus.status === "processed" && finalStatus.submitted) {
          this.log(
            "🔍 Verifying transaction was actually submitted to Horizon..."
          );
          const horizonRecord = await this.verifyOnHorizon(txHash);

          if (horizonRecord) {
            this.log(
              "🎉 SUCCESS: Transaction was successfully submitted to and processed by Horizon!"
            );
          } else {
            this.log(
              "⚠️  WARNING: Transaction was marked as submitted but not found on Horizon"
            );
          }
        }
      } else {
        this.log("❌ Transaction processing timed out");
        return {
          success: false,
          error: "Transaction processing timeout",
        };
      }

      this.log("🎉 Submit test completed successfully!");
      this.log("============================================================");

      return {
        success: true,
        txHash,
        finalStatus,
        submittedToHorizon: finalStatus?.submitted !== null,
      };
    } catch (error) {
      this.log(`❌ Submit test failed: ${error.message}`);
      this.log("============================================================");

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Main execution
async function main() {
  const tester = new StellarPaymentTester();

  // Check for test mode argument
  const testMode = process.argv[2] === "submit" ? "submit" : "normal";
  tester.log(`Running in ${testMode} mode`);

  let result;
  if (testMode === "submit") {
    result = await tester.testWithSubmit();
  } else {
    result = await tester.runFullTest();
  }

  if (result.success) {
    console.log("\n✅ Test completed successfully!");
    process.exit(0);
  } else {
    console.log("\n❌ Test failed!");
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Stellar Payment Test Script

This script tests the Refractor API by:
1. Creating a payment transaction between two test accounts
2. Submitting it to the Refractor API
3. Signing the transaction
4. Submitting the signed transaction
5. Waiting for processing
6. Verifying the result on Horizon

Usage:
  node test-stellar-payment.js [submit]

Accounts:
  Source: ${ACCOUNT_1.publicKey}
  Destination: ${ACCOUNT_2.publicKey}
  Amount: ${PAYMENT_AMOUNT} XLM
  Network: Testnet

Test Modes:
  normal   - Runs the full test with manual submission
  submit   - Signs and submits the transaction in one go (submit=true)

Requirements:
  - Refractor API running on http://localhost:4010
  - Internet connection for Testnet access
  `);
  process.exit(0);
}

// Run the test
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

module.exports = StellarPaymentTester;
