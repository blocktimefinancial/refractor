#!/usr/bin/env node

/**
 * Migration script to transition from raw MongoDB to Mongoose with Joi validation
 * This script helps migrate existing data and test the new system
 */

const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");
const config = require("./app.config.json");
const { TxModel } = require("./models/mongoose-models");
const { txModelSchema } = require("./schemas/tx-schema");

class DatabaseMigrator {
  constructor() {
    this.legacyDb = null;
    this.migratedCount = 0;
    this.errors = [];
  }

  async connect() {
    // Connect to MongoDB with both legacy and Mongoose connections
    console.log("Connecting to MongoDB...");

    // Legacy connection for reading existing data
    const legacyClient = await MongoClient.connect(config.db, {
      appname: "migrator",
      retryWrites: true,
    });
    this.legacyDb = legacyClient.db();

    // Mongoose connection for new schema
    await mongoose.connect(config.db, {
      appName: "migrator-mongoose",
    });

    console.log("Connected to MongoDB");
  }

  async validateExistingData() {
    console.log("Validating existing transaction data...");

    const txCollection = this.legacyDb.collection("tx");
    const cursor = txCollection.find({});
    let totalCount = 0;
    let validCount = 0;
    const validationErrors = [];

    for await (const doc of cursor) {
      totalCount++;

      try {
        // Convert _id to hash for validation
        const txData = { ...doc, hash: doc._id };
        delete txData._id;

        // Validate against Joi schema
        const { error } = txModelSchema.validate(txData, {
          abortEarly: false,
          allowUnknown: true,
        });

        if (error) {
          validationErrors.push({
            hash: doc._id,
            errors: error.details.map((detail) => detail.message),
          });
        } else {
          validCount++;
        }
      } catch (err) {
        validationErrors.push({
          hash: doc._id,
          errors: [err.message],
        });
      }
    }

    console.log(`Validation complete:`);
    console.log(`  Total transactions: ${totalCount}`);
    console.log(`  Valid transactions: ${validCount}`);
    console.log(`  Invalid transactions: ${totalCount - validCount}`);

    if (validationErrors.length > 0) {
      console.log("\nValidation errors:");
      validationErrors.slice(0, 10).forEach((error) => {
        console.log(`  ${error.hash}: ${error.errors.join(", ")}`);
      });

      if (validationErrors.length > 10) {
        console.log(`  ... and ${validationErrors.length - 10} more`);
      }
    }

    return { totalCount, validCount, validationErrors };
  }

  async migrateData(dryRun = true) {
    console.log(`${dryRun ? "DRY RUN: " : ""}Migrating transaction data...`);

    const txCollection = this.legacyDb.collection("tx");
    const cursor = txCollection.find({});

    for await (const doc of cursor) {
      try {
        // Transform document for Mongoose
        const txData = {
          hash: doc._id,
          network: doc.network,
          xdr: doc.xdr,
          signatures: doc.signatures || [],
          submit: doc.submit || false,
          callbackUrl: doc.callbackUrl || null,
          desiredSigners: doc.desiredSigners || [],
          minTime: doc.minTime || 0,
          maxTime: doc.maxTime || null,
          status: doc.status || "pending",
          submitted: doc.submitted || null,
          createdAt: doc.createdAt || new Date(),
          updatedAt: doc.updatedAt || new Date(),
        };

        if (!dryRun) {
          // Use upsert to handle existing documents
          await TxModel.findOneAndUpdate({ hash: txData.hash }, txData, {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          });
        }

        this.migratedCount++;

        if (this.migratedCount % 100 === 0) {
          console.log(`  Processed ${this.migratedCount} transactions...`);
        }
      } catch (error) {
        this.errors.push({
          hash: doc._id,
          error: error.message,
        });
        console.error(`Error migrating transaction ${doc._id}:`, error.message);
      }
    }

    console.log(`Migration ${dryRun ? "simulation " : ""}complete:`);
    console.log(`  Migrated: ${this.migratedCount}`);
    console.log(`  Errors: ${this.errors.length}`);

    return { migratedCount: this.migratedCount, errors: this.errors };
  }

  async createIndexes() {
    console.log("Creating indexes for optimized performance...");

    const indexes = [
      { hash: 1 }, // Unique index on hash
      { status: 1, minTime: 1 }, // Compound index for ready transactions
      { network: 1, status: 1 }, // Network-specific queries
      { maxTime: 1 }, // Expiration queries (sparse)
      { createdAt: 1 }, // Time-based queries
      { "signatures.key": 1 }, // Signature lookup
    ];

    for (const indexSpec of indexes) {
      try {
        const options = {};

        // Special handling for unique indexes
        if (indexSpec.hash) {
          options.unique = true;
        }

        // Sparse index for nullable fields
        if (indexSpec.maxTime) {
          options.sparse = true;
        }

        await TxModel.collection.createIndex(indexSpec, options);
        console.log(`  Created index:`, indexSpec);
      } catch (error) {
        console.error(`  Failed to create index:`, indexSpec, error.message);
      }
    }
  }

  async testPerformance() {
    console.log("Running performance tests...");

    const tests = [
      {
        name: "Find ready transactions",
        query: () => TxModel.findReady(10),
      },
      {
        name: "Find transaction by hash",
        query: async () => {
          const sample = await TxModel.findOne({}).select("hash");
          if (sample) {
            return TxModel.findOne({ hash: sample.hash });
          }
          return null;
        },
      },
      {
        name: "Count by status",
        query: () => TxModel.countDocuments({ status: "pending" }),
      },
      {
        name: "Find expired transactions",
        query: () => TxModel.findExpired(),
      },
    ];

    for (const test of tests) {
      const startTime = Date.now();
      try {
        const result = await test.query();
        const duration = Date.now() - startTime;
        console.log(`  ${test.name}: ${duration}ms`);
      } catch (error) {
        console.error(`  ${test.name}: ERROR - ${error.message}`);
      }
    }
  }

  async close() {
    await mongoose.connection.close();
    console.log("Migration completed, connections closed");
  }
}

async function main() {
  const migrator = new DatabaseMigrator();

  try {
    await migrator.connect();

    // Step 1: Validate existing data
    const validation = await migrator.validateExistingData();

    if (validation.validationErrors.length > 0) {
      console.log(
        "\nWARNING: Found validation errors. Please review before proceeding."
      );

      // Ask for confirmation in non-automated environments
      if (process.argv.includes("--interactive")) {
        const readline = require("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise((resolve) => {
          rl.question("Continue with migration? (y/N): ", resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== "y") {
          console.log("Migration cancelled");
          return;
        }
      }
    }

    // Step 2: Dry run migration
    if (!process.argv.includes("--skip-dry-run")) {
      await migrator.migrateData(true);
      console.log("\nDry run completed successfully");
    }

    // Step 3: Actual migration (if not in dry-run-only mode)
    if (!process.argv.includes("--dry-run-only")) {
      await migrator.migrateData(false);
    }

    // Step 4: Create indexes
    if (!process.argv.includes("--skip-indexes")) {
      await migrator.createIndexes();
    }

    // Step 5: Performance tests
    if (process.argv.includes("--test-performance")) {
      await migrator.testPerformance();
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await migrator.close();
  }
}

// Command line options:
// --dry-run-only: Only run validation and dry run
// --skip-dry-run: Skip the dry run phase
// --skip-indexes: Skip index creation
// --test-performance: Run performance tests
// --interactive: Ask for confirmation on validation errors

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DatabaseMigrator;
