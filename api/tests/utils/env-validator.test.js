/**
 * Environment Validator Tests
 *
 * Tests for environment configuration validation utility.
 */

// Don't use the mocked logger for these tests
jest.unmock("../../utils/logger");

const {
  validateEnvironment,
  getConfigSummary,
  envConfig,
} = require("../../utils/env-validator");

describe("Environment Validator", () => {
  let originalEnv;

  beforeEach(() => {
    // Save all environment variables we might modify
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      MONGODB_URL: process.env.MONGODB_URL,
      ADMIN_API_KEY: process.env.ADMIN_API_KEY,
      LOG_LEVEL: process.env.LOG_LEVEL,
      PORT: process.env.PORT,
    };

    // Set to development by default for tests
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  describe("envConfig", () => {
    it("should have required.production array", () => {
      expect(envConfig.required.production).toBeDefined();
      expect(Array.isArray(envConfig.required.production)).toBe(true);
    });

    it("should have recommended array", () => {
      expect(envConfig.recommended).toBeDefined();
      expect(Array.isArray(envConfig.recommended)).toBe(true);
    });

    it("should have optional array", () => {
      expect(envConfig.optional).toBeDefined();
      expect(Array.isArray(envConfig.optional)).toBe(true);
    });

    it("should include MONGODB_URL in production required", () => {
      const mongoVar = envConfig.required.production.find(
        (v) => v.name === "MONGODB_URL"
      );
      expect(mongoVar).toBeDefined();
      expect(mongoVar.sensitive).toBe(true);
    });

    it("should include ADMIN_API_KEY in recommended", () => {
      const adminVar = envConfig.recommended.find(
        (v) => v.name === "ADMIN_API_KEY"
      );
      expect(adminVar).toBeDefined();
      expect(adminVar.sensitive).toBe(true);
    });
  });

  describe("validateEnvironment()", () => {
    describe("in development mode", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "development";
      });

      it("should return valid result without required vars", () => {
        delete process.env.MONGODB_URL;

        const result = validateEnvironment({ exitOnError: false });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it("should add warnings for missing recommended vars", () => {
        delete process.env.ADMIN_API_KEY;

        const result = validateEnvironment({ exitOnError: false });

        expect(result.warnings.length).toBeGreaterThan(0);
        const adminWarning = result.warnings.find(
          (w) => w.variable === "ADMIN_API_KEY"
        );
        expect(adminWarning).toBeDefined();
      });

      it("should return config object", () => {
        process.env.PORT = "4010";

        const result = validateEnvironment({ exitOnError: false });

        expect(result.config).toBeDefined();
        expect(typeof result.config).toBe("object");
      });
    });

    describe("in production mode", () => {
      beforeEach(() => {
        process.env.NODE_ENV = "production";
      });

      it("should return invalid when MONGODB_URL is missing", () => {
        delete process.env.MONGODB_URL;

        const result = validateEnvironment({ exitOnError: false });

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].variable).toBe("MONGODB_URL");
      });

      it("should return valid when all required vars are set", () => {
        process.env.MONGODB_URL = "mongodb://localhost:27017/test";

        const result = validateEnvironment({ exitOnError: false });

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it("should redact sensitive values in config", () => {
        process.env.MONGODB_URL = "mongodb://user:pass@localhost:27017/test";

        const result = validateEnvironment({ exitOnError: false });

        expect(result.config.MONGODB_URL).toBe("[REDACTED]");
      });
    });

    describe("options", () => {
      it("should respect exitOnError: false", () => {
        process.env.NODE_ENV = "production";
        delete process.env.MONGODB_URL;

        // Should not exit
        const result = validateEnvironment({ exitOnError: false });

        expect(result.valid).toBe(false);
      });
    });
  });

  describe("getConfigSummary()", () => {
    it("should return object with all config variables", () => {
      const summary = getConfigSummary();

      expect(typeof summary).toBe("object");
      expect(Object.keys(summary).length).toBeGreaterThan(0);
    });

    it("should show set values", () => {
      process.env.PORT = "5000";

      const summary = getConfigSummary();

      expect(summary.PORT).toBe("5000");
    });

    it("should show default values for unset vars", () => {
      delete process.env.PORT;

      const summary = getConfigSummary();

      expect(summary.PORT).toContain("default");
    });

    it("should redact sensitive values", () => {
      process.env.MONGODB_URL = "mongodb://secret@localhost/db";

      const summary = getConfigSummary();

      expect(summary.MONGODB_URL).toBe("[REDACTED]");
    });

    it("should show (not set) for unset vars without defaults", () => {
      delete process.env.ADMIN_API_KEY;

      const summary = getConfigSummary();

      // ADMIN_API_KEY is recommended but has no default
      expect(summary.ADMIN_API_KEY).toBe("(not set)");
    });
  });
});
