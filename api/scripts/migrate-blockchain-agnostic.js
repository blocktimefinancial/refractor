#!/usr/bin/env node
/**
 * Migration Script: Convert Legacy Stellar Records to Blockchain-Agnostic Format
 *
 * This script updates existing transaction records to include the new
 * blockchain-agnostic fields while preserving backward compatibility.
 *
 * Usage:
 *   node scripts/migrate-blockchain-agnostic.js [--dry-run] [--batch-size=100]
 *
 * Options:
 *   --dry-run      Show what would be updated without making changes
 *   --batch-size   Number of records to process at once (default: 100)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const config = require("../app.config");

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const batchSizeArg = args.find((arg) => arg.startsWith("--batch-size="));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split("=")[1], 10) : 100;

// Network mapping for legacy Stellar records
const STELLAR_NETWORK_MAP = {
  0: "public",
  1: "testnet",
  2: "futurenet",
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  const mongoUrl = config.storage.connectionString;
  if (!mongoUrl) {
    throw new Error("MONGODB_URL not configured");
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUrl);
  console.log("Connected to MongoDB");
}

/**
 * Get the transaction collection
 */
function getTxCollection() {
  return mongoose.connection.collection("tx");
}

/**
 * Count records needing migration
 */
async function countLegacyRecords() {
  const collection = getTxCollection();

  // Records that have legacy fields but no blockchain field
  const count = await collection.countDocuments({
    $and: [
      { network: { $exists: true, $ne: null } },
      { xdr: { $exists: true, $ne: null } },
      {
        $or: [{ blockchain: { $exists: false } }, { blockchain: null }],
      },
    ],
  });

  return count;
}

/**
 * Migrate a batch of legacy records
 */
async function migrateBatch(skip, limit) {
  const collection = getTxCollection();

  // Find legacy records
  const legacyRecords = await collection
    .find({
      $and: [
        { network: { $exists: true, $ne: null } },
        { xdr: { $exists: true, $ne: null } },
        {
          $or: [{ blockchain: { $exists: false } }, { blockchain: null }],
        },
      ],
    })
    .skip(skip)
    .limit(limit)
    .toArray();

  if (legacyRecords.length === 0) {
    return 0;
  }

  const bulkOps = [];

  for (const record of legacyRecords) {
    const networkName = STELLAR_NETWORK_MAP[record.network] || "public";

    const update = {
      $set: {
        blockchain: "stellar",
        networkName: networkName,
        payload: record.xdr,
        encoding: "base64",
        updatedAt: new Date(),
      },
    };

    // Optionally generate txUri
    if (record.xdr && networkName) {
      update.$set.txUri = `tx:stellar:${networkName};base64,${record.xdr}`;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: record._id },
        update: update,
      },
    });
  }

  if (isDryRun) {
    console.log(`[DRY RUN] Would update ${bulkOps.length} records`);
    // Show a sample
    if (bulkOps.length > 0) {
      console.log("Sample update:", JSON.stringify(bulkOps[0], null, 2));
    }
    return bulkOps.length;
  }

  const result = await collection.bulkWrite(bulkOps);
  return result.modifiedCount;
}

/**
 * Run the migration
 */
async function runMigration() {
  console.log("=".repeat(60));
  console.log("Blockchain-Agnostic Migration Script");
  console.log("=".repeat(60));

  if (isDryRun) {
    console.log("MODE: Dry Run (no changes will be made)");
  } else {
    console.log("MODE: Live Migration");
  }
  console.log(`Batch Size: ${batchSize}`);
  console.log("");

  try {
    await connectDB();

    // Count records needing migration
    const totalLegacy = await countLegacyRecords();
    console.log(`Found ${totalLegacy} legacy records needing migration`);

    if (totalLegacy === 0) {
      console.log("No records need migration. Exiting.");
      return;
    }

    // Process in batches
    let processed = 0;
    let migrated = 0;
    let batchNumber = 0;

    while (processed < totalLegacy) {
      batchNumber++;
      console.log(
        `\nProcessing batch ${batchNumber} (${processed}/${totalLegacy})...`
      );

      const count = await migrateBatch(0, batchSize); // Always skip 0 since we're updating records
      migrated += count;
      processed += batchSize;

      if (count === 0) {
        break; // No more records to process
      }

      // Small delay to avoid overwhelming the database
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("\n" + "=".repeat(60));
    console.log("Migration Complete");
    console.log("=".repeat(60));
    console.log(`Total records migrated: ${migrated}`);

    // Verify migration
    const remainingLegacy = await countLegacyRecords();
    console.log(`Remaining legacy records: ${remainingLegacy}`);

    if (remainingLegacy > 0 && !isDryRun) {
      console.log(
        "WARNING: Some records were not migrated. Please investigate."
      );
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB");
  }
}

/**
 * Verify the migration was successful
 */
async function verifyMigration() {
  console.log("\n" + "=".repeat(60));
  console.log("Verification");
  console.log("=".repeat(60));

  const collection = getTxCollection();

  // Count records by blockchain
  const blockchainCounts = await collection
    .aggregate([
      { $group: { _id: "$blockchain", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();

  console.log("\nRecords by blockchain:");
  for (const item of blockchainCounts) {
    console.log(`  ${item._id || "(null)"}: ${item.count}`);
  }

  // Count records with new fields populated
  const withNewFields = await collection.countDocuments({
    blockchain: { $exists: true, $ne: null },
    networkName: { $exists: true, $ne: null },
    payload: { $exists: true, $ne: null },
  });

  const total = await collection.countDocuments({});
  console.log(`\nRecords with new fields: ${withNewFields}/${total}`);
}

// Run the migration
runMigration()
  .then(() => verifyMigration())
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
