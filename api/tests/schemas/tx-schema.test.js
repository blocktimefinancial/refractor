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

      it("should reject invalid public key format", () => {
        const invalidKeys = [
          "INVALID",
          "SBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP2", // S prefix (secret key)
          "GBJVUCDVNUM3UASLDXPBDXLHJBSVOEGTJX5J6P3JD7DQKVQCYCBY5PP", // Too short
          "gbjvucdvnum3uasldxpbdxlhjbsvoegtjx5j6p3jd7dqkvqcycby5pp2", // Lowercase
        ];

        invalidKeys.forEach((key) => {
          const { error } = txSignatureSchema.validate({
            ...validSignature,
            key,
          });
          expect(error).toBeDefined();
        });
      });

      it("should reject non-base64 signature", () => {
        const { error } = txSignatureSchema.validate({
          ...validSignature,
          signature: "not-valid-base64!!!",
        });
        expect(error).toBeDefined();
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
    });
  });
});
