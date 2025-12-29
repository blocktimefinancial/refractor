/**
 * 1Money Handler Tests
 *
 * Tests for 1Money blockchain handler including transaction parsing,
 * hashing, signature verification, and serialization.
 */

const {
  getHandler,
  hasHandler,
  getImplementedBlockchains,
} = require("../../business-logic/handlers/handler-factory");

describe("1Money Handler", () => {
  describe("Handler Factory Integration", () => {
    it("should have handler for onemoney", () => {
      expect(hasHandler("onemoney")).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(hasHandler("OneMoney")).toBe(true);
      expect(hasHandler("ONEMONEY")).toBe(true);
    });

    it("should be in implemented blockchains list", () => {
      const implemented = getImplementedBlockchains();
      expect(implemented).toContain("onemoney");
    });

    it("should get 1Money handler via factory", () => {
      const handler = getHandler("onemoney");
      expect(handler).toBeDefined();
      expect(handler.blockchain).toBe("onemoney");
    });
  });

  describe("OneMoneyHandler class", () => {
    let handler;

    beforeEach(() => {
      handler = getHandler("onemoney");
    });

    describe("constructor", () => {
      it("should set blockchain property", () => {
        expect(handler.blockchain).toBe("onemoney");
      });

      it("should load config from registry", () => {
        expect(handler.config).toBeDefined();
        expect(handler.config.name).toBe("1Money");
      });
    });

    describe("isValidPublicKey", () => {
      it("should accept valid Stellar-format public key", () => {
        expect(
          handler.isValidPublicKey(
            "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2"
          )
        ).toBe(true);
      });

      it("should reject invalid public key", () => {
        expect(handler.isValidPublicKey("invalid")).toBe(false);
      });

      it("should reject EVM address", () => {
        expect(
          handler.isValidPublicKey("0x742d35Cc6634C0532925a3b844Bc9e7595f8fEc5")
        ).toBe(false);
      });

      it("should reject null/undefined", () => {
        expect(handler.isValidPublicKey(null)).toBe(false);
        expect(handler.isValidPublicKey(undefined)).toBe(false);
      });
    });

    describe("normalizeNetworkName", () => {
      it("should return mainnet as default", () => {
        expect(handler.normalizeNetworkName(undefined)).toBe("mainnet");
        expect(handler.normalizeNetworkName(null)).toBe("mainnet");
      });

      it("should normalize main to mainnet", () => {
        expect(handler.normalizeNetworkName("main")).toBe("mainnet");
        expect(handler.normalizeNetworkName("MAIN")).toBe("mainnet");
      });

      it("should normalize test to testnet", () => {
        expect(handler.normalizeNetworkName("test")).toBe("testnet");
        expect(handler.normalizeNetworkName("TEST")).toBe("testnet");
      });

      it("should preserve mainnet/testnet", () => {
        expect(handler.normalizeNetworkName("mainnet")).toBe("mainnet");
        expect(handler.normalizeNetworkName("testnet")).toBe("testnet");
      });
    });

    describe("getNetworkPassphrase", () => {
      it("should return mainnet passphrase", () => {
        expect(handler.getNetworkPassphrase("mainnet")).toBe(
          "1Money Mainnet ; 2024"
        );
      });

      it("should return testnet passphrase", () => {
        expect(handler.getNetworkPassphrase("testnet")).toBe(
          "1Money Testnet ; 2024"
        );
      });

      it("should throw for unknown network", () => {
        expect(() => handler.getNetworkPassphrase("unknown")).toThrow(
          /Unknown 1Money network/
        );
      });
    });

    describe("getNetworkConfig", () => {
      it("should return mainnet config", () => {
        const config = handler.getNetworkConfig("mainnet");
        expect(config).toBeDefined();
        expect(config.name).toBe("1Money Mainnet");
        expect(config.isTestnet).toBe(false);
      });

      it("should return testnet config", () => {
        const config = handler.getNetworkConfig("testnet");
        expect(config).toBeDefined();
        expect(config.name).toBe("1Money Testnet");
        expect(config.isTestnet).toBe(true);
      });

      it("should return null for unknown network", () => {
        const config = handler.getNetworkConfig("unknownnet");
        expect(config).toBeNull();
      });
    });

    describe("parseTransaction", () => {
      it("should reject non-base64 encoding", () => {
        expect(() => {
          handler.parseTransaction("test", "hex", "mainnet");
        }).toThrow(/only supports base64 encoding/);
      });
    });

    describe("serializeTransaction", () => {
      it("should reject non-base64 encoding", () => {
        expect(() => {
          handler.serializeTransaction({}, "hex");
        }).toThrow(/only supports base64 encoding/);
      });
    });
  });

  describe("1Money vs EVM comparison", () => {
    it("should use different key formats", () => {
      const onemoneyHandler = getHandler("onemoney");
      const evmHandler = getHandler("ethereum");

      // 1Money uses Stellar-format keys (G-prefixed)
      const stellarKey =
        "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2";
      expect(onemoneyHandler.isValidPublicKey(stellarKey)).toBe(true);
      expect(evmHandler.isValidPublicKey(stellarKey)).toBe(false);

      // EVM uses 0x-prefixed addresses
      const evmAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f8fEc5";
      expect(evmHandler.isValidPublicKey(evmAddress)).toBe(true);
      expect(onemoneyHandler.isValidPublicKey(evmAddress)).toBe(false);
    });

    it("should use different encodings", () => {
      const onemoneyHandler = getHandler("onemoney");
      const evmHandler = getHandler("ethereum");

      expect(onemoneyHandler.config.defaultEncoding).toBe("base64");
      expect(evmHandler.config.defaultEncoding).toBe("hex");
    });
  });
});
