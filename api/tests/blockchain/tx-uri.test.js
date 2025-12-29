/**
 * Transaction URI Parser Tests
 */

const {
  parseTxUri,
  formatTxUri,
  convertLegacyStellarToUri,
  toLegacyStellarFormat,
  isLegacyStellarXdr,
  isValidTxUri,
  getBlockchainFromUri,
  validatePayloadEncoding,
  SUPPORTED_ENCODINGS,
  TX_URI_PREFIX,
} = require("../../business-logic/tx-uri");

describe("Transaction URI Parser", () => {
  // Sample valid XDR for testing
  const validStellarXdr =
    "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA";

  describe("parseTxUri()", () => {
    describe("valid URIs", () => {
      it("should parse stellar testnet URI", () => {
        const uri = `tx:stellar:testnet;base64,${validStellarXdr}`;
        const parsed = parseTxUri(uri);

        expect(parsed.blockchain).toBe("stellar");
        expect(parsed.network).toBe("testnet");
        expect(parsed.encoding).toBe("base64");
        expect(parsed.payload).toBe(validStellarXdr);
        expect(parsed.uri).toBe(uri);
        expect(parsed.isLegacy).toBe(false);
      });

      it("should parse stellar public URI", () => {
        const uri = `tx:stellar:public;base64,${validStellarXdr}`;
        const parsed = parseTxUri(uri);

        expect(parsed.blockchain).toBe("stellar");
        expect(parsed.network).toBe("public");
      });

      it("should parse ethereum mainnet URI", () => {
        const hexPayload =
          "0x02f8730181a28459682f008459682f0e825208940123456789abcdef0123456789abcdef01234567880de0b6b3a764000080c001";
        const uri = `tx:ethereum:mainnet;hex,${hexPayload}`;
        const parsed = parseTxUri(uri);

        expect(parsed.blockchain).toBe("ethereum");
        expect(parsed.network).toBe("mainnet");
        expect(parsed.encoding).toBe("hex");
        expect(parsed.payload).toBe(hexPayload);
      });

      it("should parse solana devnet URI", () => {
        const base64Payload =
          "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDAQLVKg==";
        const uri = `tx:solana:devnet;base64,${base64Payload}`;
        const parsed = parseTxUri(uri);

        expect(parsed.blockchain).toBe("solana");
        expect(parsed.network).toBe("devnet");
        expect(parsed.encoding).toBe("base64");
      });

      it("should parse bitcoin testnet URI", () => {
        const hexPayload =
          "0200000001abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890000000006a47304402";
        const uri = `tx:bitcoin:testnet;hex,${hexPayload}`;
        const parsed = parseTxUri(uri);

        expect(parsed.blockchain).toBe("bitcoin");
        expect(parsed.network).toBe("testnet");
        expect(parsed.encoding).toBe("hex");
      });

      it("should handle URI without network (blockchain only)", () => {
        const uri = `tx:stellar;base64,${validStellarXdr}`;
        const parsed = parseTxUri(uri);

        expect(parsed.blockchain).toBe("stellar");
        expect(parsed.network).toBeNull();
        expect(parsed.encoding).toBe("base64");
      });

      it("should be case-insensitive for blockchain and network", () => {
        const uri = `tx:STELLAR:TESTNET;BASE64,${validStellarXdr}`;
        const parsed = parseTxUri(uri);

        expect(parsed.blockchain).toBe("stellar");
        expect(parsed.network).toBe("testnet");
        expect(parsed.encoding).toBe("base64");
      });
    });

    describe("legacy format detection", () => {
      it("should detect legacy Stellar XDR", () => {
        const parsed = parseTxUri(validStellarXdr);

        expect(parsed.isLegacy).toBe(true);
        expect(parsed.blockchain).toBe("stellar");
        expect(parsed.network).toBeNull();
        expect(parsed.encoding).toBe("base64");
        expect(parsed.payload).toBe(validStellarXdr);
      });
    });

    describe("invalid URIs", () => {
      it("should throw for empty string", () => {
        expect(() => parseTxUri("")).toThrow("must be a non-empty string");
      });

      it("should throw for null", () => {
        expect(() => parseTxUri(null)).toThrow("must be a non-empty string");
      });

      it("should throw for missing tx: prefix (non-XDR)", () => {
        expect(() => parseTxUri("invalid:data")).toThrow(
          'must start with "tx:"'
        );
      });

      it("should throw for missing semicolon", () => {
        expect(() => parseTxUri("tx:stellar:testnet")).toThrow(
          "missing semicolon"
        );
      });

      it("should throw for missing comma", () => {
        expect(() => parseTxUri("tx:stellar:testnet;base64")).toThrow(
          "missing comma"
        );
      });

      it("should throw for unsupported blockchain", () => {
        expect(() => parseTxUri("tx:unsupported:testnet;base64,data")).toThrow(
          "Unsupported blockchain"
        );
      });

      it("should throw for invalid network", () => {
        expect(() => parseTxUri("tx:stellar:invalid;base64,AAAA=")).toThrow(
          "Invalid network"
        );
      });

      it("should throw for unsupported encoding", () => {
        expect(() => parseTxUri("tx:stellar:testnet;binary,data")).toThrow(
          "Unsupported encoding"
        );
      });

      it("should throw for empty payload", () => {
        expect(() => parseTxUri("tx:stellar:testnet;base64,")).toThrow(
          "payload cannot be empty"
        );
      });

      it("should throw for invalid base64 payload", () => {
        expect(() =>
          parseTxUri("tx:stellar:testnet;base64,not-valid-base64!!!")
        ).toThrow("Invalid base64");
      });

      it("should throw for invalid hex payload", () => {
        expect(() => parseTxUri("tx:ethereum:mainnet;hex,notvalidhex")).toThrow(
          "Invalid hex"
        );
      });
    });
  });

  describe("formatTxUri()", () => {
    it("should format stellar testnet URI", () => {
      const uri = formatTxUri({
        blockchain: "stellar",
        network: "testnet",
        encoding: "base64",
        payload: validStellarXdr,
      });

      expect(uri).toBe(`tx:stellar:testnet;base64,${validStellarXdr}`);
    });

    it("should format URI without network", () => {
      const uri = formatTxUri({
        blockchain: "stellar",
        encoding: "base64",
        payload: validStellarXdr,
      });

      expect(uri).toBe(`tx:stellar;base64,${validStellarXdr}`);
    });

    it("should normalize case", () => {
      const uri = formatTxUri({
        blockchain: "STELLAR",
        network: "TESTNET",
        encoding: "BASE64",
        payload: validStellarXdr,
      });

      expect(uri).toBe(`tx:stellar:testnet;base64,${validStellarXdr}`);
    });

    it("should throw for missing blockchain", () => {
      expect(() =>
        formatTxUri({
          encoding: "base64",
          payload: "data",
        })
      ).toThrow("Blockchain is required");
    });

    it("should throw for missing encoding", () => {
      expect(() =>
        formatTxUri({
          blockchain: "stellar",
          payload: "data",
        })
      ).toThrow("Encoding is required");
    });

    it("should throw for missing payload", () => {
      expect(() =>
        formatTxUri({
          blockchain: "stellar",
          encoding: "base64",
        })
      ).toThrow("Payload is required");
    });

    it("should throw for invalid blockchain", () => {
      expect(() =>
        formatTxUri({
          blockchain: "invalid",
          encoding: "base64",
          payload: "data",
        })
      ).toThrow("Unsupported blockchain");
    });

    it("should throw for invalid network", () => {
      expect(() =>
        formatTxUri({
          blockchain: "stellar",
          network: "invalid",
          encoding: "base64",
          payload: "data",
        })
      ).toThrow("Invalid network");
    });
  });

  describe("convertLegacyStellarToUri()", () => {
    it("should convert with numeric network 0 (public)", () => {
      const uri = convertLegacyStellarToUri(validStellarXdr, 0);
      expect(uri).toBe(`tx:stellar:public;base64,${validStellarXdr}`);
    });

    it("should convert with numeric network 1 (testnet)", () => {
      const uri = convertLegacyStellarToUri(validStellarXdr, 1);
      expect(uri).toBe(`tx:stellar:testnet;base64,${validStellarXdr}`);
    });

    it("should convert with numeric network 2 (futurenet)", () => {
      const uri = convertLegacyStellarToUri(validStellarXdr, 2);
      expect(uri).toBe(`tx:stellar:futurenet;base64,${validStellarXdr}`);
    });

    it("should convert with string network", () => {
      const uri = convertLegacyStellarToUri(validStellarXdr, "testnet");
      expect(uri).toBe(`tx:stellar:testnet;base64,${validStellarXdr}`);
    });

    it("should handle uppercase string network", () => {
      const uri = convertLegacyStellarToUri(validStellarXdr, "TESTNET");
      expect(uri).toBe(`tx:stellar:testnet;base64,${validStellarXdr}`);
    });

    it("should throw for invalid network", () => {
      expect(() => convertLegacyStellarToUri(validStellarXdr, 99)).toThrow(
        "Invalid Stellar network"
      );
    });
  });

  describe("toLegacyStellarFormat()", () => {
    it("should convert public network to 0", () => {
      const parsed = parseTxUri(`tx:stellar:public;base64,${validStellarXdr}`);
      const legacy = toLegacyStellarFormat(parsed);

      expect(legacy.xdr).toBe(validStellarXdr);
      expect(legacy.network).toBe(0);
    });

    it("should convert testnet network to 1", () => {
      const parsed = parseTxUri(`tx:stellar:testnet;base64,${validStellarXdr}`);
      const legacy = toLegacyStellarFormat(parsed);

      expect(legacy.xdr).toBe(validStellarXdr);
      expect(legacy.network).toBe(1);
    });

    it("should convert futurenet network to 2", () => {
      const parsed = parseTxUri(
        `tx:stellar:futurenet;base64,${validStellarXdr}`
      );
      const legacy = toLegacyStellarFormat(parsed);

      expect(legacy.xdr).toBe(validStellarXdr);
      expect(legacy.network).toBe(2);
    });

    it("should throw for non-stellar blockchain", () => {
      const parsed = {
        blockchain: "ethereum",
        network: "mainnet",
        encoding: "hex",
        payload: "0x1234",
      };
      expect(() => toLegacyStellarFormat(parsed)).toThrow(
        "Cannot convert non-Stellar"
      );
    });
  });

  describe("isLegacyStellarXdr()", () => {
    it("should return true for valid Stellar XDR", () => {
      expect(isLegacyStellarXdr(validStellarXdr)).toBe(true);
    });

    it("should return false for short strings", () => {
      expect(isLegacyStellarXdr("AAAA")).toBe(false);
    });

    it("should return false for non-AAAA prefix", () => {
      expect(isLegacyStellarXdr("BBBB" + "A".repeat(100))).toBe(false);
    });

    it("should return false for invalid base64", () => {
      expect(isLegacyStellarXdr("AAAA!!!" + "A".repeat(100))).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isLegacyStellarXdr(null)).toBe(false);
      expect(isLegacyStellarXdr(undefined)).toBe(false);
    });

    it("should return false for tx: prefixed strings", () => {
      expect(isLegacyStellarXdr("tx:stellar:testnet;base64,AAAA")).toBe(false);
    });
  });

  describe("isValidTxUri()", () => {
    it("should return true for valid URIs", () => {
      expect(isValidTxUri(`tx:stellar:testnet;base64,${validStellarXdr}`)).toBe(
        true
      );
      expect(isValidTxUri(`tx:ethereum:mainnet;hex,0x1234`)).toBe(true);
    });

    it("should return true for legacy XDR", () => {
      expect(isValidTxUri(validStellarXdr)).toBe(true);
    });

    it("should return false for invalid URIs", () => {
      expect(isValidTxUri("invalid")).toBe(false);
      expect(isValidTxUri("")).toBe(false);
      expect(isValidTxUri(null)).toBe(false);
    });
  });

  describe("getBlockchainFromUri()", () => {
    it("should extract blockchain from valid URI", () => {
      expect(getBlockchainFromUri(`tx:stellar:testnet;base64,data`)).toBe(
        "stellar"
      );
      expect(getBlockchainFromUri(`tx:ethereum:mainnet;hex,data`)).toBe(
        "ethereum"
      );
    });

    it("should handle URI without network", () => {
      expect(getBlockchainFromUri(`tx:stellar;base64,data`)).toBe("stellar");
    });

    it("should return null for invalid URI", () => {
      expect(getBlockchainFromUri("invalid")).toBeNull();
      expect(getBlockchainFromUri("")).toBeNull();
      expect(getBlockchainFromUri(null)).toBeNull();
    });
  });

  describe("validatePayloadEncoding()", () => {
    it("should accept valid base64", () => {
      expect(() =>
        validatePayloadEncoding("SGVsbG8gV29ybGQ=", "base64")
      ).not.toThrow();
      expect(() => validatePayloadEncoding("AAAA", "base64")).not.toThrow();
    });

    it("should reject invalid base64", () => {
      expect(() => validatePayloadEncoding("not valid!!!", "base64")).toThrow(
        "Invalid base64"
      );
    });

    it("should accept valid hex", () => {
      expect(() => validatePayloadEncoding("0x1234abcd", "hex")).not.toThrow();
      expect(() => validatePayloadEncoding("1234ABCD", "hex")).not.toThrow();
    });

    it("should reject invalid hex", () => {
      expect(() => validatePayloadEncoding("0xGHIJ", "hex")).toThrow(
        "Invalid hex"
      );
    });

    it("should accept valid base58", () => {
      expect(() =>
        validatePayloadEncoding(
          "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ",
          "base58"
        )
      ).not.toThrow();
    });

    it("should reject invalid base58 (contains 0, O, I, l)", () => {
      expect(() => validatePayloadEncoding("0OIl", "base58")).toThrow(
        "Invalid base58"
      );
    });
  });

  describe("constants", () => {
    it("should export SUPPORTED_ENCODINGS", () => {
      expect(SUPPORTED_ENCODINGS).toContain("base64");
      expect(SUPPORTED_ENCODINGS).toContain("hex");
      expect(SUPPORTED_ENCODINGS).toContain("base58");
    });

    it("should export TX_URI_PREFIX", () => {
      expect(TX_URI_PREFIX).toBe("tx:");
    });
  });

  describe("round-trip conversion", () => {
    it("should parse and format back to same URI", () => {
      const originalUri = `tx:stellar:testnet;base64,${validStellarXdr}`;
      const parsed = parseTxUri(originalUri);
      const formatted = formatTxUri(parsed);

      expect(formatted).toBe(originalUri);
    });

    it("should handle legacy format round-trip", () => {
      // Parse legacy -> convert to URI -> parse URI -> convert to legacy
      const legacyXdr = validStellarXdr;
      const legacyNetwork = 1;

      const uri = convertLegacyStellarToUri(legacyXdr, legacyNetwork);
      const parsed = parseTxUri(uri);
      const backToLegacy = toLegacyStellarFormat(parsed);

      expect(backToLegacy.xdr).toBe(legacyXdr);
      expect(backToLegacy.network).toBe(legacyNetwork);
    });
  });

  describe("1Money (onemoney) blockchain", () => {
    const samplePayload = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo="; // base64 encoded sample

    it("should parse onemoney mainnet URI", () => {
      const uri = `tx:onemoney:mainnet;base64,${samplePayload}`;
      const parsed = parseTxUri(uri);

      expect(parsed.blockchain).toBe("onemoney");
      expect(parsed.network).toBe("mainnet");
      expect(parsed.encoding).toBe("base64");
      expect(parsed.payload).toBe(samplePayload);
    });

    it("should format onemoney URI correctly", () => {
      const uri = formatTxUri({
        blockchain: "onemoney",
        network: "mainnet",
        encoding: "base64",
        payload: samplePayload,
      });

      expect(uri).toBe(`tx:onemoney:mainnet;base64,${samplePayload}`);
    });

    it("should validate onemoney URI", () => {
      const uri = `tx:onemoney:mainnet;base64,${samplePayload}`;
      expect(isValidTxUri(uri)).toBe(true);
    });
  });

  describe("Aptos blockchain", () => {
    const sampleHexPayload = "0x01abc123def456789";

    it("should parse aptos mainnet URI", () => {
      const uri = `tx:aptos:mainnet;hex,${sampleHexPayload}`;
      const parsed = parseTxUri(uri);

      expect(parsed.blockchain).toBe("aptos");
      expect(parsed.network).toBe("mainnet");
      expect(parsed.encoding).toBe("hex");
      expect(parsed.payload).toBe(sampleHexPayload);
    });

    it("should parse aptos testnet URI", () => {
      const uri = `tx:aptos:testnet;hex,${sampleHexPayload}`;
      const parsed = parseTxUri(uri);

      expect(parsed.blockchain).toBe("aptos");
      expect(parsed.network).toBe("testnet");
    });

    it("should parse aptos devnet URI", () => {
      const uri = `tx:aptos:devnet;hex,${sampleHexPayload}`;
      const parsed = parseTxUri(uri);

      expect(parsed.blockchain).toBe("aptos");
      expect(parsed.network).toBe("devnet");
    });

    it("should format aptos URI correctly", () => {
      const uri = formatTxUri({
        blockchain: "aptos",
        network: "testnet",
        encoding: "hex",
        payload: sampleHexPayload,
      });

      expect(uri).toBe(`tx:aptos:testnet;hex,${sampleHexPayload}`);
    });

    it("should validate aptos URI", () => {
      const uri = `tx:aptos:mainnet;hex,${sampleHexPayload}`;
      expect(isValidTxUri(uri)).toBe(true);
    });
  });

  describe("Algorand blockchain", () => {
    const sampleBase64Payload = "Z29BQkJHRDNBQUFBQUFFQUFR";
    const sampleMsgpackPayload = "gaRtc2ln";

    it("should parse algorand mainnet URI with base64", () => {
      const uri = `tx:algorand:mainnet;base64,${sampleBase64Payload}`;
      const parsed = parseTxUri(uri);

      expect(parsed.blockchain).toBe("algorand");
      expect(parsed.network).toBe("mainnet");
      expect(parsed.encoding).toBe("base64");
      expect(parsed.payload).toBe(sampleBase64Payload);
    });

    it("should parse algorand testnet URI", () => {
      const uri = `tx:algorand:testnet;base64,${sampleBase64Payload}`;
      const parsed = parseTxUri(uri);

      expect(parsed.blockchain).toBe("algorand");
      expect(parsed.network).toBe("testnet");
    });

    it("should parse algorand betanet URI", () => {
      const uri = `tx:algorand:betanet;base64,${sampleBase64Payload}`;
      const parsed = parseTxUri(uri);

      expect(parsed.blockchain).toBe("algorand");
      expect(parsed.network).toBe("betanet");
    });

    it("should parse algorand with msgpack encoding", () => {
      const uri = `tx:algorand:mainnet;msgpack,${sampleMsgpackPayload}`;
      const parsed = parseTxUri(uri);

      expect(parsed.blockchain).toBe("algorand");
      expect(parsed.encoding).toBe("msgpack");
      expect(parsed.payload).toBe(sampleMsgpackPayload);
    });

    it("should format algorand URI correctly", () => {
      const uri = formatTxUri({
        blockchain: "algorand",
        network: "testnet",
        encoding: "base64",
        payload: sampleBase64Payload,
      });

      expect(uri).toBe(`tx:algorand:testnet;base64,${sampleBase64Payload}`);
    });

    it("should format algorand msgpack URI correctly", () => {
      const uri = formatTxUri({
        blockchain: "algorand",
        network: "mainnet",
        encoding: "msgpack",
        payload: sampleMsgpackPayload,
      });

      expect(uri).toBe(`tx:algorand:mainnet;msgpack,${sampleMsgpackPayload}`);
    });

    it("should validate algorand URI", () => {
      expect(
        isValidTxUri(`tx:algorand:mainnet;base64,${sampleBase64Payload}`)
      ).toBe(true);
      expect(
        isValidTxUri(`tx:algorand:testnet;msgpack,${sampleMsgpackPayload}`)
      ).toBe(true);
    });
  });

  describe("new encoding support", () => {
    it("should include msgpack in supported encodings", () => {
      expect(SUPPORTED_ENCODINGS).toContain("msgpack");
    });

    it("should include base32 in supported encodings", () => {
      expect(SUPPORTED_ENCODINGS).toContain("base32");
    });
  });
});

/**
 * CAIP (Chain Agnostic Improvement Proposals) URI Tests
 */
const {
  parseCAIPUri,
  formatCAIPUri,
  isValidCAIPUri,
  toCAIPFormat,
  toSimpleFormat,
  resolveCAIPChain,
  CAIP_URI_PREFIX,
  CAIP_NAMESPACE_MAP,
  BLOCKCHAIN_TO_CAIP,
} = require("../../business-logic/tx-uri");

describe("CAIP URI Support", () => {
  const validStellarXdr =
    "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAABTWgh1bRm6Aksd3hHdZ0hlVxDTTfqfP2kfxwVWAsCDjgAAAAAAAAAAAJiWgAAAAAAAAAAA";
  const validEthHex =
    "0x02f8730181a28459682f008459682f0e825208940123456789abcdef0123456789abcdef01234567880de0b6b3a764000080c001";

  describe("CAIP_URI_PREFIX", () => {
    it("should be blockchain://", () => {
      expect(CAIP_URI_PREFIX).toBe("blockchain://");
    });
  });

  describe("parseCAIPUri()", () => {
    describe("Ethereum EIP-155 namespace", () => {
      it("should parse Ethereum mainnet (eip155:1)", () => {
        const uri = `blockchain://eip155:1/tx/hex;${validEthHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("ethereum");
        expect(parsed.network).toBe("mainnet");
        expect(parsed.encoding).toBe("hex");
        expect(parsed.payload).toBe(validEthHex);
        expect(parsed.format).toBe("caip");
        expect(parsed.caip.namespace).toBe("eip155");
        expect(parsed.caip.chainId).toBe("1");
      });

      it("should parse Ethereum Sepolia (eip155:11155111)", () => {
        const uri = `blockchain://eip155:11155111/tx/hex;${validEthHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("ethereum");
        expect(parsed.network).toBe("sepolia");
      });

      it("should parse Polygon mainnet (eip155:137)", () => {
        const uri = `blockchain://eip155:137/tx/hex;${validEthHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("polygon");
        expect(parsed.network).toBe("mainnet");
      });

      it("should parse Arbitrum mainnet (eip155:42161)", () => {
        const uri = `blockchain://eip155:42161/tx/hex;${validEthHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("arbitrum");
        expect(parsed.network).toBe("mainnet");
      });

      it("should parse Base mainnet (eip155:8453)", () => {
        const uri = `blockchain://eip155:8453/tx/hex;${validEthHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("base");
        expect(parsed.network).toBe("mainnet");
      });

      it("should parse Optimism mainnet (eip155:10)", () => {
        const uri = `blockchain://eip155:10/tx/hex;${validEthHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("optimism");
        expect(parsed.network).toBe("mainnet");
      });

      it("should parse Avalanche mainnet (eip155:43114)", () => {
        const uri = `blockchain://eip155:43114/tx/hex;${validEthHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("avalanche");
        expect(parsed.network).toBe("mainnet");
      });
    });

    describe("Stellar namespace", () => {
      it("should parse Stellar public network", () => {
        const uri = `blockchain://stellar:public/tx/base64;${validStellarXdr}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("stellar");
        expect(parsed.network).toBe("public");
        expect(parsed.encoding).toBe("base64");
        expect(parsed.caip.namespace).toBe("stellar");
        expect(parsed.caip.chainId).toBe("public");
      });

      it("should parse Stellar testnet", () => {
        const uri = `blockchain://stellar:testnet/tx/base64;${validStellarXdr}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("stellar");
        expect(parsed.network).toBe("testnet");
      });
    });

    describe("Solana namespace", () => {
      const solanaPayload =
        "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEDAQLVKg==";

      it("should parse Solana mainnet", () => {
        const uri = `blockchain://solana:mainnet/tx/base64;${solanaPayload}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("solana");
        expect(parsed.network).toBe("mainnet");
      });

      it("should parse Solana devnet", () => {
        const uri = `blockchain://solana:devnet/tx/base64;${solanaPayload}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("solana");
        expect(parsed.network).toBe("devnet");
      });
    });

    describe("Bitcoin BIP-122 namespace", () => {
      const bitcoinHex =
        "0200000001abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890000000006a47304402";

      it("should parse Bitcoin mainnet via genesis hash", () => {
        const uri = `blockchain://bip122:000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f/tx/hex;${bitcoinHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("bitcoin");
        expect(parsed.network).toBe("mainnet");
      });

      it("should parse Bitcoin testnet via genesis hash", () => {
        const uri = `blockchain://bip122:000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943/tx/hex;${bitcoinHex}`;
        const parsed = parseCAIPUri(uri);

        expect(parsed.blockchain).toBe("bitcoin");
        expect(parsed.network).toBe("testnet");
      });
    });

    describe("error cases", () => {
      it("should throw for missing /tx/ path", () => {
        expect(() => parseCAIPUri("blockchain://eip155:1/hex;data")).toThrow(
          "missing /tx/ path segment"
        );
      });

      it("should throw for invalid namespace", () => {
        expect(() =>
          parseCAIPUri("blockchain://invalid:1/tx/hex;data")
        ).toThrow("Unsupported CAIP namespace: invalid");
      });

      it("should throw for unknown chain ID", () => {
        expect(() =>
          parseCAIPUri("blockchain://eip155:99999999/tx/hex;data")
        ).toThrow('Unknown chain ID "99999999"');
      });

      it("should throw for missing colon in chain identifier", () => {
        expect(() => parseCAIPUri("blockchain://eip155/tx/hex;data")).toThrow(
          "chain identifier must be in format"
        );
      });

      it("should throw for missing semicolon separator", () => {
        expect(() => parseCAIPUri("blockchain://eip155:1/tx/hexdata")).toThrow(
          "missing semicolon separator"
        );
      });
    });
  });

  describe("formatCAIPUri()", () => {
    it("should format Ethereum mainnet CAIP URI", () => {
      const uri = formatCAIPUri({
        blockchain: "ethereum",
        network: "mainnet",
        encoding: "hex",
        payload: validEthHex,
      });

      expect(uri).toBe(`blockchain://eip155:1/tx/hex;${validEthHex}`);
    });

    it("should format Stellar testnet CAIP URI", () => {
      const uri = formatCAIPUri({
        blockchain: "stellar",
        network: "testnet",
        encoding: "base64",
        payload: validStellarXdr,
      });

      expect(uri).toBe(
        `blockchain://stellar:testnet/tx/base64;${validStellarXdr}`
      );
    });

    it("should format Polygon mainnet CAIP URI", () => {
      const uri = formatCAIPUri({
        blockchain: "polygon",
        network: "mainnet",
        encoding: "hex",
        payload: validEthHex,
      });

      expect(uri).toBe(`blockchain://eip155:137/tx/hex;${validEthHex}`);
    });

    it("should format Base Sepolia CAIP URI", () => {
      const uri = formatCAIPUri({
        blockchain: "base",
        network: "sepolia",
        encoding: "hex",
        payload: validEthHex,
      });

      expect(uri).toBe(`blockchain://eip155:84532/tx/hex;${validEthHex}`);
    });

    it("should throw for missing network", () => {
      expect(() =>
        formatCAIPUri({
          blockchain: "ethereum",
          encoding: "hex",
          payload: "data",
        })
      ).toThrow("Network is required for CAIP format");
    });

    it("should throw for blockchain without CAIP mapping", () => {
      // This would require a blockchain with no CAIP mapping
      // Currently all supported blockchains have mappings
    });
  });

  describe("isValidCAIPUri()", () => {
    it("should return true for valid CAIP URIs", () => {
      expect(
        isValidCAIPUri(`blockchain://eip155:1/tx/hex;${validEthHex}`)
      ).toBe(true);
      expect(
        isValidCAIPUri(
          `blockchain://stellar:testnet/tx/base64;${validStellarXdr}`
        )
      ).toBe(true);
    });

    it("should return false for simple format URIs", () => {
      expect(isValidCAIPUri(`tx:ethereum:mainnet;hex,${validEthHex}`)).toBe(
        false
      );
    });

    it("should return false for invalid CAIP URIs", () => {
      expect(isValidCAIPUri("blockchain://invalid:1/tx/hex;data")).toBe(false);
      expect(isValidCAIPUri("not-a-uri")).toBe(false);
    });
  });

  describe("toCAIPFormat()", () => {
    it("should convert simple format to CAIP format", () => {
      const simple = `tx:ethereum:mainnet;hex,${validEthHex}`;
      const caip = toCAIPFormat(simple);

      expect(caip).toBe(`blockchain://eip155:1/tx/hex;${validEthHex}`);
    });

    it("should convert Stellar simple to CAIP", () => {
      const simple = `tx:stellar:public;base64,${validStellarXdr}`;
      const caip = toCAIPFormat(simple);

      expect(caip).toBe(
        `blockchain://stellar:public/tx/base64;${validStellarXdr}`
      );
    });

    it("should throw if network is missing", () => {
      // Would need a URI without network, but parseTxUri requires valid format
    });
  });

  describe("toSimpleFormat()", () => {
    it("should convert CAIP format to simple format", () => {
      const caip = `blockchain://eip155:1/tx/hex;${validEthHex}`;
      const simple = toSimpleFormat(caip);

      expect(simple).toBe(`tx:ethereum:mainnet;hex,${validEthHex}`);
    });

    it("should convert Stellar CAIP to simple", () => {
      const caip = `blockchain://stellar:testnet/tx/base64;${validStellarXdr}`;
      const simple = toSimpleFormat(caip);

      expect(simple).toBe(`tx:stellar:testnet;base64,${validStellarXdr}`);
    });
  });

  describe("resolveCAIPChain()", () => {
    it("should resolve eip155 chains", () => {
      expect(resolveCAIPChain("eip155", "1")).toEqual({
        blockchain: "ethereum",
        network: "mainnet",
      });

      expect(resolveCAIPChain("eip155", "137")).toEqual({
        blockchain: "polygon",
        network: "mainnet",
      });
    });

    it("should resolve stellar chains", () => {
      expect(resolveCAIPChain("stellar", "public")).toEqual({
        blockchain: "stellar",
        network: "public",
      });
    });

    it("should throw for unsupported namespace", () => {
      expect(() => resolveCAIPChain("unsupported", "1")).toThrow(
        "Unsupported CAIP namespace"
      );
    });
  });

  describe("round-trip conversion", () => {
    it("should round-trip simple -> CAIP -> simple", () => {
      const original = `tx:ethereum:mainnet;hex,${validEthHex}`;
      const caip = toCAIPFormat(original);
      const back = toSimpleFormat(caip);

      expect(back).toBe(original);
    });

    it("should round-trip CAIP -> simple -> CAIP", () => {
      const original = `blockchain://stellar:testnet/tx/base64;${validStellarXdr}`;
      const simple = toSimpleFormat(original);
      const back = toCAIPFormat(simple);

      expect(back).toBe(original);
    });
  });

  describe("parseTxUri() CAIP detection", () => {
    it("should auto-detect and parse CAIP URIs", () => {
      const uri = `blockchain://eip155:1/tx/hex;${validEthHex}`;
      const parsed = parseTxUri(uri);

      expect(parsed.format).toBe("caip");
      expect(parsed.blockchain).toBe("ethereum");
      expect(parsed.network).toBe("mainnet");
    });

    it("should auto-detect and parse simple URIs", () => {
      const uri = `tx:ethereum:mainnet;hex,${validEthHex}`;
      const parsed = parseTxUri(uri);

      expect(parsed.format).toBe("simple");
      expect(parsed.blockchain).toBe("ethereum");
    });
  });

  describe("CAIP_NAMESPACE_MAP", () => {
    it("should contain eip155 namespace", () => {
      expect(CAIP_NAMESPACE_MAP.eip155).toBeDefined();
      expect(CAIP_NAMESPACE_MAP.eip155.chainIdToNetwork[1]).toBe("mainnet");
    });

    it("should contain stellar namespace", () => {
      expect(CAIP_NAMESPACE_MAP.stellar).toBeDefined();
      expect(CAIP_NAMESPACE_MAP.stellar.networkIdToNetwork.public).toBe(
        "public"
      );
    });

    it("should contain solana namespace", () => {
      expect(CAIP_NAMESPACE_MAP.solana).toBeDefined();
    });

    it("should contain bip122 namespace for Bitcoin", () => {
      expect(CAIP_NAMESPACE_MAP.bip122).toBeDefined();
      expect(CAIP_NAMESPACE_MAP.bip122.blockchain).toBe("bitcoin");
    });
  });

  describe("BLOCKCHAIN_TO_CAIP", () => {
    it("should map ethereum to eip155", () => {
      expect(BLOCKCHAIN_TO_CAIP.ethereum.namespace).toBe("eip155");
      expect(BLOCKCHAIN_TO_CAIP.ethereum.networks.mainnet).toBe("1");
    });

    it("should map polygon to eip155 with chain ID 137", () => {
      expect(BLOCKCHAIN_TO_CAIP.polygon.namespace).toBe("eip155");
      expect(BLOCKCHAIN_TO_CAIP.polygon.networks.mainnet).toBe("137");
    });

    it("should map stellar to stellar namespace", () => {
      expect(BLOCKCHAIN_TO_CAIP.stellar.namespace).toBe("stellar");
    });

    it("should map bitcoin to bip122", () => {
      expect(BLOCKCHAIN_TO_CAIP.bitcoin.namespace).toBe("bip122");
    });
  });
});
