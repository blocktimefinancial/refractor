/**
 * In-Memory Data Provider Tests
 *
 * Tests for the in-memory storage provider used in testing.
 */

const storageLayer = require("../../storage/storage-layer");

describe("InMemory Data Provider", () => {
  beforeAll(async () => {
    await storageLayer.initDataProvider("inmemory");
  });

  beforeEach(async () => {
    // Clear all data between tests by re-initializing
    storageLayer.dataProvider.storage = {};
  });

  const sampleTransaction = {
    hash: "89d6c423a51e030b392f0e7505e9f3b66be11cb1477aecda79a34e5ae61060e4",
    network: 1,
    xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
    signatures: [],
    status: "pending",
    minTime: 0,
  };

  describe("saveTransaction()", () => {
    it("should save a new transaction", async () => {
      await storageLayer.dataProvider.saveTransaction(sampleTransaction);

      const result = await storageLayer.dataProvider.findTransaction(
        sampleTransaction.hash
      );
      expect(result).toBeDefined();
      expect(result.hash).toBe(sampleTransaction.hash);
    });

    it("should save transaction with signatures", async () => {
      const txWithSigs = {
        ...sampleTransaction,
        signatures: [
          {
            key: "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2",
            signature:
              "b1N3ZHZIjuxU+5Fgz1Kj65FntxUOK4V8fxePNmoIc1J5DESkBcPzWTs8ULLldhnqJo6I4+L+xSzZt8+yiwQDBQ==",
          },
        ],
      };

      await storageLayer.dataProvider.saveTransaction(txWithSigs);

      const result = await storageLayer.dataProvider.findTransaction(
        txWithSigs.hash
      );
      expect(result.signatures.length).toBe(1);
      expect(result.signatures[0].key).toBe(txWithSigs.signatures[0].key);
    });
  });

  describe("findTransaction()", () => {
    beforeEach(async () => {
      await storageLayer.dataProvider.saveTransaction(sampleTransaction);
    });

    it("should find existing transaction by hash", async () => {
      const result = await storageLayer.dataProvider.findTransaction(
        sampleTransaction.hash
      );

      expect(result).toBeDefined();
      expect(result.hash).toBe(sampleTransaction.hash);
      expect(result.network).toBe(sampleTransaction.network);
    });

    it("should return undefined for non-existent hash", async () => {
      const result = await storageLayer.dataProvider.findTransaction(
        "nonexistent".repeat(8).substring(0, 64)
      );

      expect(result).toBeUndefined();
    });

    it("should return transaction with all fields", async () => {
      const result = await storageLayer.dataProvider.findTransaction(
        sampleTransaction.hash
      );

      expect(result.xdr).toBe(sampleTransaction.xdr);
      expect(result.status).toBe(sampleTransaction.status);
      expect(result.minTime).toBe(sampleTransaction.minTime);
    });
  });

  describe("updateTransaction()", () => {
    beforeEach(async () => {
      await storageLayer.dataProvider.saveTransaction(sampleTransaction);
    });

    it("should update transaction status", async () => {
      await storageLayer.dataProvider.updateTransaction(
        sampleTransaction.hash,
        {
          status: "ready",
        }
      );

      const updated = await storageLayer.dataProvider.findTransaction(
        sampleTransaction.hash
      );
      expect(updated.status).toBe("ready");
    });

    it("should add signatures to transaction", async () => {
      const newSignature = {
        key: "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2",
        signature:
          "b1N3ZHZIjuxU+5Fgz1Kj65FntxUOK4V8fxePNmoIc1J5DESkBcPzWTs8ULLldhnqJo6I4+L+xSzZt8+yiwQDBQ==",
      };

      await storageLayer.dataProvider.updateTransaction(
        sampleTransaction.hash,
        {
          signatures: [newSignature],
        }
      );

      const updated = await storageLayer.dataProvider.findTransaction(
        sampleTransaction.hash
      );
      expect(updated.signatures.length).toBe(1);
    });

    it("should preserve unchanged fields", async () => {
      await storageLayer.dataProvider.updateTransaction(
        sampleTransaction.hash,
        {
          status: "ready",
        }
      );

      const updated = await storageLayer.dataProvider.findTransaction(
        sampleTransaction.hash
      );
      expect(updated.network).toBe(sampleTransaction.network);
      expect(updated.xdr).toBe(sampleTransaction.xdr);
    });

    it("should return false for non-existent transaction", async () => {
      const result = await storageLayer.dataProvider.updateTransaction(
        "nonexistent".repeat(8).substring(0, 64),
        { status: "ready" }
      );
      expect(result).toBe(false);
    });
  });

  describe("listTransactions()", () => {
    beforeEach(async () => {
      // Save multiple transactions with different statuses
      await storageLayer.dataProvider.saveTransaction({
        ...sampleTransaction,
        hash: "a".repeat(64),
        status: "pending",
      });
      await storageLayer.dataProvider.saveTransaction({
        ...sampleTransaction,
        hash: "b".repeat(64),
        status: "ready",
      });
      await storageLayer.dataProvider.saveTransaction({
        ...sampleTransaction,
        hash: "c".repeat(64),
        status: "ready",
      });
      await storageLayer.dataProvider.saveTransaction({
        ...sampleTransaction,
        hash: "d".repeat(64),
        status: "processed",
      });
    });

    it("should list all transactions when no filter", async () => {
      const cursor = storageLayer.dataProvider.listTransactions({});
      const results = await cursor.toArray();

      expect(results.length).toBe(4);
    });

    it("should filter by status", async () => {
      const cursor = storageLayer.dataProvider.listTransactions({
        status: "ready",
      });
      const results = await cursor.toArray();

      expect(results.length).toBe(2);
      results.forEach((tx) => {
        expect(tx.status).toBe("ready");
      });
    });

    it("should support async iteration", async () => {
      const cursor = storageLayer.dataProvider.listTransactions({});
      const results = [];

      for await (const tx of cursor) {
        results.push(tx);
      }

      expect(results.length).toBe(4);
    });
  });
});
