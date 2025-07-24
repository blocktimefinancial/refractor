// Load environment variables first
require("dotenv").config();

// Load base configuration from JSON
const baseConfig = require("./app.config.json");

// Create enhanced configuration with environment variable support
const config = {
  ...baseConfig,

  // Override storage to use mongoose and MongoDB
  storage: process.env.STORAGE_TYPE || "mongoose",

  // Use environment variable for MongoDB connection
  db:
    process.env.MONGODB_URL ||
    baseConfig.db ||
    "mongodb://localhost:27017/refractor",

  // Update network configurations with environment variables
  networks: {
    public: {
      horizon:
        process.env.HORIZON_PUBLIC_URL || baseConfig.networks.public.horizon,
      network: "PUBLIC",
      passphrase: baseConfig.networks.public.passphrase,
    },
    testnet: {
      horizon:
        process.env.HORIZON_TESTNET_URL || baseConfig.networks.testnet.horizon,
      network: "TESTNET",
      passphrase: baseConfig.networks.testnet.passphrase,
    },
  },
  // Use environment variable for fee multiplier
  feeMultiplier: process.env.FEE_MULTIPLIER
    ? parseInt(process.env.FEE_MULTIPLIER, 10)
    : baseConfig.feeMultiplier || 1, // Default to 1 if not set
};

// Log configuration details (without sensitive info)
console.log("Configuration loaded:");
console.log(`- Storage: ${config.storage}`);
console.log(
  `- Database: ${config.db.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}`
); // Hide credentials
console.log(`- Public Horizon: ${config.networks.public.horizon}`);
console.log(`- Testnet Horizon: ${config.networks.testnet.horizon}`);

module.exports = config;
