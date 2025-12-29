# Refractor

A blockchain-agnostic pending transactions storage and multisig aggregator.

## Overview

Refractor is a service that allows anyone to store transactions and gather signatures required to match the signing threshold. Originally built for Stellar, it now supports a unified API for multiple blockchains.

### Key Features

- **Multi-blockchain support**: Store and manage transactions for 12+ blockchains
- **Signature aggregation**: Automatically collects and validates signatures
- **Threshold management**: Computes signing thresholds and tracks progress
- **Automatic submission**: Submits transactions when thresholds are met (Stellar)
- **Callback notifications**: Notifies your server when transactions are ready
- **Backward compatible**: Legacy Stellar API continues to work

## Supported Blockchains

| Blockchain | Transaction Storage | Signature Verification | Auto-Submit |
| ---------- | ------------------- | ---------------------- | ----------- |
| Stellar    | ✅                  | ✅                     | ✅          |
| Ethereum   | ✅                  | 🚧                     | 🚧          |
| Polygon    | ✅                  | 🚧                     | 🚧          |
| Arbitrum   | ✅                  | 🚧                     | 🚧          |
| Optimism   | ✅                  | 🚧                     | 🚧          |
| Base       | ✅                  | 🚧                     | 🚧          |
| Avalanche  | ✅                  | 🚧                     | 🚧          |
| Solana     | ✅                  | 🚧                     | 🚧          |
| Bitcoin    | ✅                  | 🚧                     | 🚧          |
| Algorand   | ✅                  | 🚧                     | 🚧          |
| Aptos      | ✅                  | 🚧                     | 🚧          |
| OneMoney   | ✅                  | 🚧                     | 🚧          |

✅ = Fully supported | 🚧 = Coming soon

## Installation

```bash
# Clone the repository
git clone https://github.com/blocktimefinancial/refractor.git
cd refractor

# Install API dependencies
cd api
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your configuration

# Run tests
npm test

# Start the server
npm start
```

## Configuration

Create a `.env` file in the `api` directory:

```env
# MongoDB connection
MONGODB_URL=mongodb://localhost:27017/refractor

# Server configuration
PORT=3000
NODE_ENV=production

# Stellar Horizon URLs (optional, defaults provided)
STELLAR_HORIZON_PUBLIC=https://horizon.stellar.org
STELLAR_HORIZON_TESTNET=https://horizon-testnet.stellar.org
```

## API Usage

### Transaction URI Formats

Refractor supports two URI formats for blockchain-agnostic transaction handling:

#### Simple Format

```
tx:<blockchain>[:<network>];<encoding>,<payload>
```

Examples:

```
tx:stellar:testnet;base64,AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0h...
tx:ethereum:sepolia;hex,0x02f87082aa36...
tx:solana:devnet;base58,5KKsLVU...
```

#### CAIP Format (Chain Agnostic Improvement Proposals)

```
<blockchain>://<namespace>:<chain_id>/tx/<encoding>;<payload>
```

Examples:

```
stellar://stellar:1/tx/base64;AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0h...
ethereum://eip155:11155111/tx/hex;0x02f87082aa36...
```

### Submit a Transaction

#### Using Transaction URI (Recommended)

```bash
curl -X POST https://api.refractor.space/tx \
  -H "Content-Type: application/json" \
  -d '{
    "txUri": "tx:stellar:testnet;base64,AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0h...",
    "submit": true
  }'
```

#### Using Component Fields

```bash
curl -X POST https://api.refractor.space/tx \
  -H "Content-Type: application/json" \
  -d '{
    "blockchain": "stellar",
    "networkName": "testnet",
    "payload": "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0h...",
    "encoding": "base64",
    "submit": true
  }'
```

#### Legacy Format (Stellar Only)

```bash
curl -X POST https://api.refractor.space/tx \
  -H "Content-Type: application/json" \
  -d '{
    "network": "testnet",
    "xdr": "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0h...",
    "submit": true
  }'
```

### Retrieve Transaction

```bash
curl https://api.refractor.space/tx/a1ef625e2bda7e71493b8a6bb4b03fa6512a67593d99acacfe5fb59b79e28154
```

### Response Format

```json
{
  "hash": "a1ef625e2bda7e71493b8a6bb4b03fa6512a67593d99acacfe5fb59b79e28154",
  "blockchain": "stellar",
  "networkName": "testnet",
  "txUri": "tx:stellar:testnet;base64,AAAAAgAAAABT...",
  "status": "pending",
  "xdr": "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0h...",
  "payload": "AAAAAgAAAABTWgh1bRm6Aksd3hHdZ0h...",
  "encoding": "base64",
  "signatures": [
    {
      "key": "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ",
      "signature": "d30a85c..."
    }
  ],
  "submit": true,
  "minTime": 0,
  "maxTime": 1727178665
}
```

## Network Names

### Stellar Networks

| Network Name | Chain ID | Description       |
| ------------ | -------- | ----------------- |
| `public`     | 0        | Stellar Mainnet   |
| `testnet`    | 1        | Stellar Testnet   |
| `futurenet`  | 2        | Stellar Futurenet |

### Ethereum Networks (EIP-155)

| Network Name | Chain ID | Description                 |
| ------------ | -------- | --------------------------- |
| `mainnet`    | 1        | Ethereum Mainnet            |
| `sepolia`    | 11155111 | Sepolia Testnet             |
| `goerli`     | 5        | Goerli Testnet (deprecated) |

## Supported Encodings

| Encoding  | Use Case             |
| --------- | -------------------- |
| `base64`  | Stellar XDR          |
| `hex`     | Ethereum, EVM chains |
| `base58`  | Solana, Bitcoin      |
| `msgpack` | Algorand             |
| `base32`  | Generic              |

## Transaction Status Flow

```
pending → ready → processing → processed
                           ↘ failed
```

- **pending**: Waiting for more signatures
- **ready**: Has enough signatures, waiting for submission
- **processing**: Being submitted to the network
- **processed**: Successfully submitted
- **failed**: Submission failed

## Development

### Running Tests

```bash
cd api
npm test                    # Run all tests
npm test -- --watch         # Watch mode
npm test -- --coverage      # With coverage
```

### Project Structure

```
api/
├── api/                    # Route handlers
├── business-logic/         # Core logic
│   ├── handlers/           # Blockchain handlers
│   ├── finalization/       # Transaction submission
│   └── queue/              # Background processing
├── middleware/             # Express middleware
├── models/                 # Data models
├── schemas/                # Validation schemas
├── storage/                # Data providers
├── tests/                  # Test suites
└── utils/                  # Utilities

ui/                         # Frontend application
└── open-api/               # OpenAPI specification
```

## API Documentation

Full OpenAPI documentation is available at:

- **Interactive**: https://api.refractor.space/docs
- **OpenAPI Spec**: [ui/open-api/openapi.yml](ui/open-api/openapi.yml)

## Migration Guide

### From Legacy API (v0.1.x)

The legacy API using `network` and `xdr` fields continues to work:

```javascript
// Legacy (still works)
{
  "network": "testnet",
  "xdr": "AAAAAgAAAABT..."
}

// New recommended format
{
  "txUri": "tx:stellar:testnet;base64,AAAAAgAAAABT..."
}
```

### New Fields in Response

Responses now include additional fields:

- `blockchain`: The blockchain identifier (e.g., "stellar")
- `networkName`: The network name (e.g., "testnet")
- `txUri`: Transaction URI in simple format
- `payload`: Encoded transaction data
- `encoding`: Payload encoding (e.g., "base64")

Legacy fields (`network`, `xdr`) are still included for backward compatibility.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contact

- Website: https://refractor.space
- Email: info@stellar.expert
