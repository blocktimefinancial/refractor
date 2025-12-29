/**
 * Transaction Schema Tests
 *
 * Tests for Joi validation schemas used throughout the API.
 */

const {
  txModelSchema,
  txSignatureSchema,
  txSubmissionSchema,
  txHashSchema,
  txStatusEnum,
} = require("../../schemas/tx-schema");

describe("Transaction Schemas", () => {
  describe("txStatusEnum", () => {
    it("should contain expected status values", () => {
      expect(txStatusEnum).toContain("pending");
      expect(txStatusEnum).toContain("ready");
      expect(txStatusEnum).toContain("processing");
      expect(txStatusEnum).toContain("processed");
      expect(txStatusEnum).toContain("failed");
    });

    it("should have exactly 5 statuses", () => {
      expect(txStatusEnum.length).toBe(5);
    });
  });

  describe("txSignatureSchema", () => {
    const validSignature = {
      key: "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2",
      signature:
        "b1N3ZHZIjuxU+5Fgz1Kj65FntxUOK4V8fxePNmoIc1J5DESkBcPzWTs8ULLldhnqJo6I4+L+xSzZt8+yiwQDBQ==",
    };

    describe("valid signatures", () => {
      it("should accept valid signature object", () => {
        const { error } = txSignatureSchema.validate(validSignature);
        expect(error).toBeUndefined();
      });

      it("should accept different valid public keys", () => {
        const testKeys = [
          "GDNMOFMXT7ZGAN3SV5LBYYJVYEUPM5LQWL2NF2WW7JFG4LQLRFU2MQ3I",
          "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
        ];

        testKeys.forEach((key) => {
          const { error } = txSignatureSchema.validate({
            ...validSignature,
            key,
          });
          expect(error).toBeUndefined();
        });
      });
    });

    describe("invalid signatures", () => {
      it("should reject missing key", () => {
        const { error } = txSignatureSchema.validate({
          signature: validSignature.signature,
        });
        expect(error).toBeDefined();
      });

      it("should reject missing signature", () => {
        const { error } = txSignatureSchema.validate({
          key: validSignature.key,
        });
        expect(error).toBeDefined();
      });

      // Note: With blockchain-agnostic design, the generic txSignatureSchema
      // accepts any string format. Use stellarSignatureSchema or evmSignatureSchema
      // for blockchain-specific validation.
      it("should accept any key format (blockchain-agnostic)", () => {
        const anyKeys = [
          "INVALID",
          "SBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2", // S prefix
          "0x742d35Cc6634C0532925a3b844Bc9e7595f8fEc5", // EVM address
          "any-valid-string-key",
        ];

        anyKeys.forEach((key) => {
          const { error } = txSignatureSchema.validate({
            ...validSignature,
            key,
          });
          expect(error).toBeUndefined();
        });
      });

      it("should accept any signature format (blockchain-agnostic)", () => {
        const { error } = txSignatureSchema.validate({
          ...validSignature,
          signature: "any-signature-format",
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe("txHashSchema", () => {
    const validHash = {
      hash: "89d6c423a51e030b392f0e7505e9f3b66be11cb1477aecda79a34e5ae61060e4",
    };

    describe("valid hashes", () => {
      it("should accept valid 64-character lowercase hex hash", () => {
        const { error } = txHashSchema.validate(validHash);
        expect(error).toBeUndefined();
      });

      it("should accept all-zeros hash", () => {
        const { error } = txHashSchema.validate({
          hash: "0".repeat(64),
        });
        expect(error).toBeUndefined();
      });

      it("should accept all-f hash", () => {
        const { error } = txHashSchema.validate({
          hash: "f".repeat(64),
        });
        expect(error).toBeUndefined();
      });
    });

    describe("invalid hashes", () => {
      it("should reject hash that is too short", () => {
        const { error } = txHashSchema.validate({
          hash: "a".repeat(63),
        });
        expect(error).toBeDefined();
      });

      it("should reject hash that is too long", () => {
        const { error } = txHashSchema.validate({
          hash: "a".repeat(65),
        });
        expect(error).toBeDefined();
      });

      it("should reject uppercase hash", () => {
        const { error } = txHashSchema.validate({
          hash: "A".repeat(64),
        });
        expect(error).toBeDefined();
      });

      it("should reject hash with invalid characters", () => {
        const { error } = txHashSchema.validate({
          hash: "g".repeat(64), // 'g' is not valid hex
        });
        expect(error).toBeDefined();
      });

      it("should reject empty hash", () => {
        const { error } = txHashSchema.validate({
          hash: "",
        });
        expect(error).toBeDefined();
      });

      it("should reject missing hash", () => {
        const { error } = txHashSchema.validate({});
        expect(error).toBeDefined();
      });
    });
  });

  describe("txSubmissionSchema", () => {
    const validSubmission = {
      xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
      network: 0,
    };

    describe("valid submissions", () => {
      it("should accept minimal valid submission", () => {
        const { error } = txSubmissionSchema.validate(validSubmission);
        expect(error).toBeUndefined();
      });

      it("should accept pubnet (network: 0)", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          network: 0,
        });
        expect(error).toBeUndefined();
      });

      it("should accept testnet (network: 1)", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          network: 1,
        });
        expect(error).toBeUndefined();
      });

      it("should accept optional callbackUrl", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          callbackUrl: "https://example.com/callback",
        });
        expect(error).toBeUndefined();
      });

      it("should accept optional submit flag", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          submit: true,
        });
        expect(error).toBeUndefined();
      });

      it("should accept optional desiredSigners", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          desiredSigners: [
            "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2",
          ],
        });
        expect(error).toBeUndefined();
      });
    });

    describe("invalid submissions", () => {
      it("should reject missing xdr", () => {
        const { error } = txSubmissionSchema.validate({
          network: 0,
        });
        expect(error).toBeDefined();
      });

      it("should reject missing network", () => {
        const { error } = txSubmissionSchema.validate({
          xdr: validSubmission.xdr,
        });
        expect(error).toBeDefined();
      });

      it("should reject invalid network (3)", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          network: 3, // Values 0-2 are valid (pubnet, testnet, futurenet)
        });
        expect(error).toBeDefined();
      });

      it("should reject negative network", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          network: -1,
        });
        expect(error).toBeDefined();
      });

      it("should reject invalid callbackUrl", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          callbackUrl: "not-a-url",
        });
        expect(error).toBeDefined();
      });

      it("should reject invalid desiredSigners format", () => {
        const { error } = txSubmissionSchema.validate({
          ...validSubmission,
          desiredSigners: ["INVALID_KEY"],
        });
        expect(error).toBeDefined();
      });
    });

    describe("default values", () => {
      it("should default submit to false", () => {
        const { value } = txSubmissionSchema.validate(validSubmission);
        expect(value.submit).toBe(false);
      });

      it("should default signatures to empty array", () => {
        const { value } = txSubmissionSchema.validate(validSubmission);
        expect(value.signatures).toEqual([]);
      });

      it("should default desiredSigners to empty array", () => {
        const { value } = txSubmissionSchema.validate(validSubmission);
        expect(value.desiredSigners).toEqual([]);
      });
    });
  });

  describe("txModelSchema", () => {
    const validModel = {
      hash: "89d6c423a51e030b392f0e7505e9f3b66be11cb1477aecda79a34e5ae61060e4",
      network: 1,
      xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
    };

    describe("valid models", () => {
      it("should accept minimal valid model", () => {
        const { error } = txModelSchema.validate(validModel);
        expect(error).toBeUndefined();
      });

      it("should accept all valid status values", () => {
        txStatusEnum.forEach((status) => {
          const { error } = txModelSchema.validate({
            ...validModel,
            status,
          });
          expect(error).toBeUndefined();
        });
      });

      it("should accept signatures array", () => {
        const { error } = txModelSchema.validate({
          ...validModel,
          signatures: [
            {
              key: "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2",
              signature:
                "b1N3ZHZIjuxU+5Fgz1Kj65FntxUOK4V8fxePNmoIc1J5DESkBcPzWTs8ULLldhnqJo6I4+L+xSzZt8+yiwQDBQ==",
            },
          ],
        });
        expect(error).toBeUndefined();
      });
    });

    describe("invalid models", () => {
      it("should reject invalid status", () => {
        const { error } = txModelSchema.validate({
          ...validModel,
          status: "invalid_status",
        });
        expect(error).toBeDefined();
      });

      it("should reject negative minTime", () => {
        const { error } = txModelSchema.validate({
          ...validModel,
          minTime: -1,
        });
        expect(error).toBeDefined();
      });

      it("should reject negative retryCount", () => {
        const { error } = txModelSchema.validate({
          ...validModel,
          retryCount: -1,
        });
        expect(error).toBeDefined();
      });
    });

    describe("default values", () => {
      it("should default status to pending", () => {
        const { value } = txModelSchema.validate(validModel);
        expect(value.status).toBe("pending");
      });

      it("should default minTime to 0", () => {
        const { value } = txModelSchema.validate(validModel);
        expect(value.minTime).toBe(0);
      });

      it("should default retryCount to 0", () => {
        const { value } = txModelSchema.validate(validModel);
        expect(value.retryCount).toBe(0);
      });

      it("should default signatures to empty array", () => {
        const { value } = txModelSchema.validate(validModel);
        expect(value.signatures).toEqual([]);
      });

      it("should default blockchain to stellar", () => {
        const { value } = txModelSchema.validate(validModel);
        expect(value.blockchain).toBe("stellar");
      });

      it("should default encoding to base64", () => {
        const { value } = txModelSchema.validate(validModel);
        expect(value.encoding).toBe("base64");
      });
    });
  });
});

/**
 * Blockchain-Agnostic Schema Tests
 */
const {
  legacyStellarSubmissionSchema,
  blockchainAgnosticSubmissionSchema,
  stellarSignatureSchema,
  evmSignatureSchema,
  genericSignatureSchema,
  supportedBlockchains,
} = require("../../schemas/tx-schema");

describe("Blockchain-Agnostic Schemas", () => {
  describe("supportedBlockchains", () => {
    it("should include stellar", () => {
      expect(supportedBlockchains).toContain("stellar");
    });

    it("should include ethereum", () => {
      expect(supportedBlockchains).toContain("ethereum");
    });

    it("should include solana", () => {
      expect(supportedBlockchains).toContain("solana");
    });

    it("should include multiple blockchains", () => {
      expect(supportedBlockchains.length).toBeGreaterThan(5);
    });
  });

  describe("stellarSignatureSchema", () => {
    it("should accept valid Stellar signature", () => {
      const { error } = stellarSignatureSchema.validate({
        key: "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2",
        signature: "YWJjZGVmZ2hpamtsbW5vcA==",
      });
      expect(error).toBeUndefined();
    });

    it("should reject non-G-prefix key", () => {
      const { error } = stellarSignatureSchema.validate({
        key: "0x1234567890abcdef1234567890abcdef12345678",
        signature: "YWJjZGVmZ2hpamtsbW5vcA==",
      });
      expect(error).toBeDefined();
    });
  });

  describe("evmSignatureSchema", () => {
    it("should accept valid Ethereum signature", () => {
      const { error } = evmSignatureSchema.validate({
        key: "0x1234567890abcdef1234567890abcdef12345678",
        signature:
          "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      });
      expect(error).toBeUndefined();
    });

    it("should reject non-0x-prefix address", () => {
      const { error } = evmSignatureSchema.validate({
        key: "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2",
        signature: "0xabcdef",
      });
      expect(error).toBeDefined();
    });

    it("should reject address with wrong length", () => {
      const { error } = evmSignatureSchema.validate({
        key: "0x123456",
        signature: "0xabcdef",
      });
      expect(error).toBeDefined();
    });
  });

  describe("genericSignatureSchema", () => {
    it("should accept any key format", () => {
      const { error } = genericSignatureSchema.validate({
        key: "any-key-format-here",
        signature: "any-signature",
        encoding: "base64",
      });
      expect(error).toBeUndefined();
    });

    it("should default encoding to base64", () => {
      const { value } = genericSignatureSchema.validate({
        key: "key",
        signature: "sig",
      });
      expect(value.encoding).toBe("base64");
    });

    it("should accept hex encoding", () => {
      const { error } = genericSignatureSchema.validate({
        key: "key",
        signature: "sig",
        encoding: "hex",
      });
      expect(error).toBeUndefined();
    });
  });

  describe("legacyStellarSubmissionSchema", () => {
    const validLegacy = {
      xdr: "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA",
      network: 1,
    };

    it("should accept legacy Stellar format", () => {
      const { error } = legacyStellarSubmissionSchema.validate(validLegacy);
      expect(error).toBeUndefined();
    });

    it("should accept network as string", () => {
      const { error } = legacyStellarSubmissionSchema.validate({
        ...validLegacy,
        network: "testnet",
      });
      expect(error).toBeUndefined();
    });

    it("should require xdr", () => {
      const { error } = legacyStellarSubmissionSchema.validate({
        network: 1,
      });
      expect(error).toBeDefined();
    });

    it("should require network", () => {
      const { error } = legacyStellarSubmissionSchema.validate({
        xdr: validLegacy.xdr,
      });
      expect(error).toBeDefined();
    });
  });

  describe("blockchainAgnosticSubmissionSchema", () => {
    describe("txUri format", () => {
      it("should accept txUri submission", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          txUri: "tx:stellar:testnet;base64,AAAAAgAAAABT...",
        });
        expect(error).toBeUndefined();
      });

      it("should accept CAIP format txUri", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          txUri: "blockchain://eip155:1/tx/hex;0x1234...",
        });
        expect(error).toBeUndefined();
      });
    });

    describe("component format", () => {
      it("should accept blockchain + networkName + payload", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          blockchain: "ethereum",
          networkName: "mainnet",
          payload: "0x1234567890abcdef",
          encoding: "hex",
        });
        expect(error).toBeUndefined();
      });

      it("should require blockchain with payload", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          networkName: "mainnet",
          payload: "0x1234",
        });
        expect(error).toBeDefined();
      });

      it("should require networkName with payload", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          blockchain: "ethereum",
          payload: "0x1234",
        });
        expect(error).toBeDefined();
      });

      it("should require either txUri or payload", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          blockchain: "ethereum",
          networkName: "mainnet",
        });
        expect(error).toBeDefined();
      });
    });

    describe("common fields", () => {
      it("should accept submit flag", () => {
        const { error, value } = blockchainAgnosticSubmissionSchema.validate({
          txUri: "tx:stellar:testnet;base64,data",
          submit: true,
        });
        expect(error).toBeUndefined();
        expect(value.submit).toBe(true);
      });

      it("should accept callbackUrl", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          txUri: "tx:stellar:testnet;base64,data",
          callbackUrl: "https://example.com/callback",
        });
        expect(error).toBeUndefined();
      });

      it("should accept desiredSigners", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          txUri: "tx:stellar:testnet;base64,data",
          desiredSigners: ["signer1", "signer2"],
        });
        expect(error).toBeUndefined();
      });

      it("should accept minTime and maxTime", () => {
        const { error } = blockchainAgnosticSubmissionSchema.validate({
          txUri: "tx:stellar:testnet;base64,data",
          minTime: 1000000,
          maxTime: 2000000,
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe("txModelSchema blockchain-agnostic fields", () => {
    const validModel = {
      hash: "a".repeat(64),
      blockchain: "ethereum",
      networkName: "mainnet",
      payload: "0x1234567890",
      encoding: "hex",
    };

    it("should accept blockchain-agnostic model", () => {
      const { error } = txModelSchema.validate(validModel);
      expect(error).toBeUndefined();
    });

    it("should accept all supported blockchains", () => {
      supportedBlockchains.forEach((blockchain) => {
        const { error } = txModelSchema.validate({
          ...validModel,
          blockchain,
        });
        expect(error).toBeUndefined();
      });
    });

    it("should reject unsupported blockchain", () => {
      const { error } = txModelSchema.validate({
        ...validModel,
        blockchain: "unsupported-chain",
      });
      expect(error).toBeDefined();
    });

    it("should accept all supported encodings", () => {
      const encodings = ["base64", "hex", "base58", "msgpack", "base32"];
      encodings.forEach((encoding) => {
        const { error } = txModelSchema.validate({
          ...validModel,
          encoding,
        });
        expect(error).toBeUndefined();
      });
    });

    it("should reject unsupported encoding", () => {
      const { error } = txModelSchema.validate({
        ...validModel,
        encoding: "unsupported",
      });
      expect(error).toBeDefined();
    });

    it("should allow null for legacy fields", () => {
      const { error } = txModelSchema.validate({
        hash: "a".repeat(64),
        blockchain: "ethereum",
        networkName: "mainnet",
        payload: "0x1234",
        encoding: "hex",
        network: null,
        xdr: null,
      });
      expect(error).toBeUndefined();
    });
  });
});
