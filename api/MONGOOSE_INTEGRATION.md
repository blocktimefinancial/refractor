# Refractor API - Mongoose Integration & FastQ Optimization

This document outlines the integration of Mongoose ORM with Joi/Joigoose validation and enhanced FastQ workers for the Refractor API.

## Overview

The Refractor API has been upgraded with:

1. **Mongoose ORM** for better MongoDB integration
2. **Joi + Joigoose** for robust schema validation
3. **Enhanced FastQ workers** with monitoring and adaptive concurrency
4. **Comprehensive monitoring** endpoints
5. **Input validation middleware**

## Features

### 🔧 Database Layer Improvements

- **Mongoose Models**: Replaced raw MongoDB operations with Mongoose models
- **Schema Validation**: Joi schemas with automatic Mongoose conversion via Joigoose
- **Automatic Indexing**: Optimized database indexes for performance
- **Connection Management**: Improved connection handling with retry logic

### ⚡ FastQ Worker Enhancements

- **Adaptive Concurrency**: Automatically adjusts worker concurrency based on load
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Monitoring**: Real-time metrics collection and reporting
- **Error Handling**: Enhanced error categorization and handling

### 📊 Monitoring & Observability

- **Queue Metrics**: Processing rates, success rates, average processing times
- **Health Checks**: System health endpoints for monitoring
- **Performance Insights**: Database and queue performance statistics
- **Administrative Controls**: Pause/resume queues, adjust concurrency

## Configuration

### Enhanced App Configuration

```json
{
  "storage": "mongoose",
  "parallelTasks": 50,
  "maxParallelTasks": 100,
  "minParallelTasks": 5,
  "adaptiveConcurrency": true,
  "retryAttempts": 3,
  "retryDelay": 1000,
  "horizonConcurrency": 10,
  "maxHorizonConcurrency": 20,
  "adaptiveHorizonConcurrency": true,
  "horizonRetryAttempts": 5,
  "horizonRetryDelay": 2000,
  "metricsInterval": 30000
}
```

## API Endpoints

### Transaction Endpoints

#### `POST /tx`

Submit a new transaction for processing.

**Request Body:**

```json
{
  "hash": "string (64 hex chars)",
  "network": "number (0=pubnet, 1=testnet)",
  "xdr": "string (transaction XDR)",
  "signatures": [
    {
      "key": "string (Stellar public key)",
      "signature": "string (base64 signature)"
    }
  ],
  "submit": "boolean",
  "callbackUrl": "string (optional URL)",
  "desiredSigners": ["string (Stellar public keys)"],
  "minTime": "number (UNIX timestamp)",
  "maxTime": "number (UNIX timestamp)"
}
```

#### `GET /tx/:hash`

Retrieve transaction by hash.

### Monitoring Endpoints

#### `GET /monitoring/metrics`

Get comprehensive system metrics.

**Response:**

```json
{
  "finalizer": {
    "metrics": {
      "processed": 1250,
      "failed": 3,
      "throughput": 12.5,
      "queueLength": 45,
      "concurrency": 50,
      "successRate": 99.7,
      "avgProcessingTime": 1500
    },
    "status": {
      "length": 45,
      "running": 12,
      "concurrency": 50,
      "paused": false,
      "idle": false
    }
  },
  "database": {
    "total": 10000,
    "byStatus": {
      "pending": { "count": 150, "avgRetryCount": 0 },
      "ready": { "count": 45, "avgRetryCount": 0 },
      "processed": { "count": 9800, "avgRetryCount": 0.1 }
    }
  }
}
```

#### `GET /monitoring/health`

System health check.

#### `POST /monitoring/queue/pause`

Pause queue processing.

#### `POST /monitoring/queue/resume`

Resume queue processing.

#### `POST /monitoring/queue/concurrency`

Adjust queue concurrency.

**Request Body:**

```json
{
  "concurrency": 75
}
```

#### `POST /monitoring/cleanup/expired`

Clean up expired transactions.

## Database Schema

### Transaction Model

```javascript
{
  hash: String (unique, indexed),
  network: Number (indexed),
  xdr: Buffer,
  signatures: [{
    key: String,
    signature: Buffer
  }],
  submit: Boolean,
  callbackUrl: String,
  desiredSigners: [String],
  minTime: Number (indexed),
  maxTime: Number (sparse indexed),
  status: String (indexed),
  submitted: Number,
  createdAt: Date (indexed),
  updatedAt: Date,
  retryCount: Number,
  lastError: String
}
```

### Indexes

- `hash`: Unique index for fast lookups
- `status + minTime`: Compound index for ready transactions
- `network + status`: Network-specific queries
- `maxTime`: Sparse index for expiration queries
- `createdAt`: Time-based queries
- `signatures.key`: Signature lookups

## Migration

### Running the Migration

```bash
# Dry run (validation + simulation)
node scripts/migrate-to-mongoose.js --dry-run-only

# Full migration with performance tests
node scripts/migrate-to-mongoose.js --test-performance

# Interactive migration (asks for confirmation)
node scripts/migrate-to-mongoose.js --interactive
```

### Migration Steps

1. **Validation**: Validates existing data against new schemas
2. **Dry Run**: Simulates migration without changes
3. **Migration**: Migrates data to new schema
4. **Indexing**: Creates optimized indexes
5. **Testing**: Performance validation

## Performance Optimizations

### FastQ Worker Features

1. **Adaptive Concurrency**

   - Monitors queue length and processing times
   - Automatically adjusts worker count
   - Prevents system overload

2. **Smart Retry Logic**

   - Exponential backoff with jitter
   - Error categorization (retryable vs non-retryable)
   - Maximum retry limits

3. **Metrics Collection**
   - Processing time tracking
   - Success/failure rates
   - Queue utilization metrics

### Database Optimizations

1. **Strategic Indexing**

   - Compound indexes for common queries
   - Sparse indexes for optional fields
   - Time-based indexes for cleanup

2. **Connection Management**

   - Connection pooling
   - Automatic reconnection
   - Health monitoring

3. **Query Optimization**
   - Efficient cursor-based iteration
   - Projection optimization
   - Aggregation pipelines for statistics

## Error Handling

### Validation Errors

```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "hash",
      "message": "\"hash\" must match pattern",
      "value": "invalid-hash"
    }
  ]
}
```

### Queue Errors

- **Retryable**: Network timeouts, temporary failures
- **Non-retryable**: Validation errors, 4xx HTTP responses
- **Fatal**: System errors, configuration issues

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Queue Health**

   - Processing throughput
   - Error rates
   - Queue depth
   - Processing times

2. **Database Performance**

   - Connection count
   - Query performance
   - Index usage
   - Storage utilization

3. **System Resources**
   - Memory usage
   - CPU utilization
   - Network I/O

### Recommended Alerts

- Queue depth > 1000 transactions
- Error rate > 5%
- Average processing time > 10 seconds
- Database connection failures
- System resource exhaustion

## Best Practices

### Configuration Tuning

1. **Start Conservative**: Begin with lower concurrency values
2. **Monitor Performance**: Watch metrics before increasing load
3. **Test Thoroughly**: Validate in staging environment
4. **Gradual Scaling**: Increase concurrency incrementally

### Operations

1. **Regular Cleanup**: Schedule expired transaction cleanup
2. **Monitor Queues**: Watch for buildup or stalls
3. **Log Analysis**: Review error patterns and trends
4. **Capacity Planning**: Plan for peak loads

## Troubleshooting

### Common Issues

1. **Queue Stalls**

   - Check error logs
   - Verify network connectivity
   - Review retry settings

2. **High Memory Usage**

   - Reduce queue size
   - Lower concurrency
   - Check for memory leaks

3. **Database Connection Issues**
   - Verify connection string
   - Check network connectivity
   - Review MongoDB logs

### Debug Commands

```bash
# Check queue status
curl http://localhost:4010/monitoring/health

# Get detailed metrics
curl http://localhost:4010/monitoring/metrics

# Pause processing for maintenance
curl -X POST http://localhost:4010/monitoring/queue/pause

# Resume processing
curl -X POST http://localhost:4010/monitoring/queue/resume
```
