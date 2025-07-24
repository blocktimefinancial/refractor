#!/usr/bin/env node

const mongoose = require("mongoose");
const config = require("../app.config");

async function fixHashIndex() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(config.db);

    const collection = mongoose.connection.db.collection("tx");

    console.log("Checking existing indexes...");
    const indexes = await collection.indexes();
    console.log("Current indexes:", JSON.stringify(indexes, null, 2));

    // Check if hash_1 index exists
    const hashIndex = indexes.find((idx) => idx.name === "hash_1");
    if (hashIndex) {
      console.log("Dropping hash_1 index...");
      await collection.dropIndex("hash_1");
      console.log("✅ Dropped hash_1 index successfully");
    } else {
      console.log("ℹ️  hash_1 index not found");
    }

    // Check for documents with hash field
    const docsWithHash = await collection.countDocuments({
      hash: { $exists: true },
    });
    console.log(`Found ${docsWithHash} documents with hash field`);

    if (docsWithHash > 0) {
      console.log("Removing hash field from existing documents...");
      const result = await collection.updateMany(
        { hash: { $exists: true } },
        { $unset: { hash: "" } }
      );
      console.log(
        `✅ Removed hash field from ${result.modifiedCount} documents`
      );
    }

    console.log("✅ Database fix completed successfully!");
  } catch (error) {
    console.error("❌ Error fixing database:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run the fix
fixHashIndex().catch(console.error);
