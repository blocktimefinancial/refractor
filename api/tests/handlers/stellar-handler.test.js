/**
 * Tests for Stellar Handler
 *
 * Tests the Stellar-specific blockchain handler implementation.
 */

const stellarHandler = require("../../business-logic/handlers/stellar-handler");

describe("Stellar Handler", () => {
  // Sample valid XDR for testing
  const validXdr =
    "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA";

  describe("constructor", () => {
    it("should have blockchain set to stellar", () => {
      expect(stellarHandler.blockchain).toBe("stellar");
    });

    it("should have config loaded", () => {
      expect(stellarHandler.config).toBeDefined();
      expect(stellarHandler.config.name).toBe("Stellar");
    });
  });

  describe("normalizeNetworkName()", () => {
    it("should normalize various mainnet names to public", () => {
      expect(stellarHandler.normalizeNetworkName("public")).toBe("public");
      expect(stellarHandler.normalizeNetworkName("pubnet")).toBe("public");
      expect(stellarHandler.normalizeNetworkName("mainnet")).toBe("public");
      expect(stellarHandler.normalizeNetworkName("main")).toBe("public");
      expect(stellarHandler.normalizeNetworkName("0")).toBe("public");
      expect(stellarHandler.normalizeNetworkName(0)).toBe("public");
    });

    it("should normalize testnet names", () => {
      expect(stellarHandler.normalizeNetworkName("testnet")).toBe("testnet");
      expect(stellarHandler.normalizeNetworkName("test")).toBe("testnet");
      expect(stellarHandler.normalizeNetworkName("1")).toBe("testnet");
      expect(stellarHandler.normalizeNetworkName(1)).toBe("testnet");
    });

    it("should normalize futurenet names", () => {
      expect(stellarHandler.normalizeNetworkName("futurenet")).toBe(
        "futurenet"
      );
      expect(stellarHandler.normalizeNetworkName("future")).toBe("futurenet");
      expect(stellarHandler.normalizeNetworkName("2")).toBe("futurenet");
      expect(stellarHandler.normalizeNetworkName(2)).toBe("futurenet");
    });
  });

  describe("getNetworkPassphrase()", () => {
    it("should return correct passphrase for public network", () => {
      const passphrase = stellarHandler.getNetworkPassphrase("public");
      expect(passphrase).toBe("Public Global Stellar Network ; September 2015");
    });

    it("should return correct passphrase for testnet", () => {
      const passphrase = stellarHandler.getNetworkPassphrase("testnet");
      expect(passphrase).toBe("Test SDF Network ; September 2015");
    });

    it("should return correct passphrase for futurenet", () => {
      const passphrase = stellarHandler.getNetworkPassphrase("futurenet");
      expect(passphrase).toBe("Test SDF Future Network ; October 2022");
    });

    it("should accept various network name formats", () => {
      expect(stellarHandler.getNetworkPassphrase("mainnet")).toBe(
        "Public Global Stellar Network ; September 2015"
      );
      expect(stellarHandler.getNetworkPassphrase(0)).toBe(
        "Public Global Stellar Network ; September 2015"
      );
    });

    it("should throw for unknown network", () => {
      expect(() => {
        stellarHandler.getNetworkPassphrase("unknown");
      }).toThrow(/Unknown Stellar network/);
    });
  });

  describe("getHorizonUrl()", () => {
    it("should return horizon URL for public network", () => {
      const url = stellarHandler.getHorizonUrl("public");
      expect(url).toContain("horizon");
    });

    it("should return horizon URL for testnet", () => {
      const url = stellarHandler.getHorizonUrl("testnet");
      expect(url).toContain("horizon");
    });
  });

  describe("parseTransaction()", () => {
    it("should parse valid XDR", () => {
      const tx = stellarHandler.parseTransaction(validXdr, "base64", "testnet");
      expect(tx).toBeDefined();
      expect(typeof tx.toXDR).toBe("function");
    });

    it("should throw for non-base64 encoding", () => {
      expect(() => {
        stellarHandler.parseTransaction(validXdr, "hex", "testnet");
      }).toThrow(/only supports base64/);
    });

    it("should throw for invalid XDR", () => {
      expect(() => {
        stellarHandler.parseTransaction("not-valid-xdr", "base64", "testnet");
      }).toThrow(/Invalid Stellar transaction XDR/);
    });
  });

  describe("computeHash()", () => {
    it("should compute transaction hash", () => {
      const tx = stellarHandler.parseTransaction(validXdr, "base64", "testnet");
      const { hash, hashRaw } = stellarHandler.computeHash(tx);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64); // SHA-256 hex
      expect(hashRaw).toBeInstanceOf(Buffer);
    });
  });

  describe("extractSignatures()", () => {
    it("should extract signatures from transaction", () => {
      const tx = stellarHandler.parseTransaction(validXdr, "base64", "testnet");
      const signatures = stellarHandler.extractSignatures(tx);

      expect(Array.isArray(signatures)).toBe(true);
    });
  });

  describe("serializeTransaction()", () => {
    it("should serialize transaction back to XDR", () => {
      const tx = stellarHandler.parseTransaction(validXdr, "base64", "testnet");
      const serialized = stellarHandler.serializeTransaction(tx, "base64");

      expect(typeof serialized).toBe("string");
      // The serialized XDR should be valid base64
      expect(() => Buffer.from(serialized, "base64")).not.toThrow();
    });

    it("should throw for non-base64 encoding", () => {
      const tx = stellarHandler.parseTransaction(validXdr, "base64", "testnet");
      expect(() => {
        stellarHandler.serializeTransaction(tx, "hex");
      }).toThrow(/only supports base64/);
    });
  });

  describe("isValidPublicKey()", () => {
    it("should validate correct Stellar public key", () => {
      const validKey =
        "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2";
      expect(stellarHandler.isValidPublicKey(validKey)).toBe(true);
    });

    it("should reject secret key (S prefix)", () => {
      const secretKey =
        "SBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2";
      expect(stellarHandler.isValidPublicKey(secretKey)).toBe(false);
    });

    it("should reject invalid key", () => {
      expect(stellarHandler.isValidPublicKey("invalid")).toBe(false);
      expect(stellarHandler.isValidPublicKey("")).toBe(false);
      expect(stellarHandler.isValidPublicKey(null)).toBe(false);
    });
  });

  describe("getLegacyNetworkId()", () => {
    it("should return 0 for public network", () => {
      expect(stellarHandler.getLegacyNetworkId("public")).toBe(0);
      expect(stellarHandler.getLegacyNetworkId("mainnet")).toBe(0);
    });

    it("should return 1 for testnet", () => {
      expect(stellarHandler.getLegacyNetworkId("testnet")).toBe(1);
    });

    it("should return 2 for futurenet", () => {
      expect(stellarHandler.getLegacyNetworkId("futurenet")).toBe(2);
    });

    it("should throw for unknown network", () => {
      expect(() => {
        stellarHandler.getLegacyNetworkId("unknown");
      }).toThrow(/Cannot convert network/);
    });
  });

  describe("parseTransactionParams()", () => {
    it("should parse transaction params", () => {
      const tx = stellarHandler.parseTransaction(validXdr, "base64", "testnet");
      const params = stellarHandler.parseTransactionParams(tx, {
        networkName: "testnet",
      });

      expect(params.blockchain).toBe("stellar");
      expect(params.networkName).toBe("testnet");
      expect(params.encoding).toBe("base64");
      expect(params.xdr).toBeDefined();
      expect(params.payload).toBeDefined();
    });

    it("should parse optional fields", () => {
      const tx = stellarHandler.parseTransaction(validXdr, "base64", "testnet");
      const params = stellarHandler.parseTransactionParams(tx, {
        networkName: "testnet",
        callbackUrl: "https://example.com/callback",
        submit: true,
      });

      expect(params.callbackUrl).toBe("https://example.com/callback");
      expect(params.submit).toBe(true);
    });

    it("should throw for invalid callback URL", () => {
      const tx = stellarHandler.parseTransaction(validXdr, "base64", "testnet");
      expect(() => {
        stellarHandler.parseTransactionParams(tx, {
          networkName: "testnet",
          callbackUrl: "not-a-valid-url",
        });
      }).toThrow(/Invalid URL/);
    });
  });
});
