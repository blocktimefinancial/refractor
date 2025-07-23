# Refractor API - Production Deployment Guide

This guide covers deploying the enhanced Refractor API with Mongoose integration and optimized FastQ workers to production.

## Pre-Deployment Checklist

### 1. Environment Preparation

- [ ] MongoDB cluster configured and accessible
- [ ] Environment variables set
- [ ] SSL/TLS certificates ready
- [ ] Monitoring systems prepared
- [ ] Backup procedures established

### 2. Dependencies

```bash
# Install production dependencies
npm ci --only=production

# Verify critical packages
npm list mongoose joi joigoose fastq
```

### 3. Configuration Validation

```bash
# Validate configuration
node -e "console.log(require('./app.config.json'))"

# Test database connection
node -e "
const mongoose = require('mongoose');
const config = require('./app.config.json');
mongoose.connect(config.db).then(() => {
  console.log('Database connection successful');
  process.exit(0);
}).catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});
"
```

## Migration to Production

### Step 1: Data Migration

```bash
# 1. Backup existing data
mongodump --uri="your-mongodb-uri" --out=backup-$(date +%Y%m%d)

# 2. Run migration script in dry-run mode
node scripts/migrate-to-mongoose.js --dry-run-only

# 3. Review migration results
# Check logs for validation errors

# 4. Run actual migration (if dry-run successful)
node scripts/migrate-to-mongoose.js --test-performance
```

### Step 2: Application Deployment

#### Blue-Green Deployment (Recommended)

```bash
# 1. Deploy new version to green environment
# 2. Update configuration to use Mongoose
# 3. Run health checks
curl http://green-environment/monitoring/health

# 4. Switch traffic to green environment
# 5. Monitor metrics closely
curl http://green-environment/monitoring/metrics

# 6. Keep blue environment running for rollback
```

#### Rolling Deployment

```bash
# 1. Deploy to one instance at a time
# 2. Verify each instance before proceeding
# 3. Monitor queue processing during deployment
```

### Step 3: Configuration Updates

#### Production app.config.json

```json
{
  "port": 4010,
  "trustProxy": true,
  "storage": "mongoose",
  "db": "mongodb+srv://production-user:password@cluster.mongodb.net/refractor-prod?retryWrites=true&w=majority",
  "parallelTasks": 75,
  "maxParallelTasks": 150,
  "minParallelTasks": 10,
  "targetQueueSize": 500,
  "tickerTimeout": 3000,
  "adaptiveConcurrency": true,
  "retryAttempts": 5,
  "retryDelay": 2000,
  "horizonConcurrency": 15,
  "maxHorizonConcurrency": 30,
  "adaptiveHorizonConcurrency": true,
  "horizonRetryAttempts": 7,
  "horizonRetryDelay": 3000,
  "metricsInterval": 30000
}
```

## Production Configuration

### Environment Variables

```bash
# Required
export NODE_ENV=production
export PORT=4010
export MONGODB_URI="mongodb+srv://..."

# Optional optimizations
export UV_THREADPOOL_SIZE=128
export NODE_OPTIONS="--max-old-space-size=2048"
```

### PM2 Configuration (ecosystem.config.js)

```javascript
module.exports = {
  apps: [
    {
      name: "refractor-api",
      script: "./api.js",
      instances: 4,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 4010,
        UV_THREADPOOL_SIZE: 128,
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "1G",
      watch: false,
      ignore_watch: ["node_modules", "logs"],
      instances: "max",
      exec_mode: "cluster",
    },
  ],
};
```

### Docker Configuration

#### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4010/monitoring/health || exit 1

# Run as non-root user
USER node

EXPOSE 4010

CMD ["node", "api.js"]
```

#### docker-compose.yml

```yaml
version: "3.8"

services:
  refractor-api:
    build: .
    ports:
      - "4010:4010"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
    restart: unless-stopped
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4010/monitoring/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    volumes:
      - ./logs:/app/logs
    networks:
      - refractor-network

networks:
  refractor-network:
    driver: bridge
```

## Monitoring Setup

### Application Metrics

#### Prometheus Integration

```javascript
// Add to api.js
const promClient = require("prom-client");

// Create metrics
const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
});

const queueMetrics = new promClient.Gauge({
  name: "queue_length",
  help: "Current queue length",
});

// Export metrics endpoint
app.get("/metrics", (req, res) => {
  res.set("Content-Type", promClient.register.contentType);
  res.end(promClient.register.metrics());
});
```

#### Custom Metrics Collection

```bash
# Create monitoring script
cat > scripts/collect-metrics.js << 'EOF'
const axios = require('axios');
const fs = require('fs');

async function collectMetrics() {
  try {
    const response = await axios.get('http://localhost:4010/monitoring/metrics');
    const metrics = {
      timestamp: new Date().toISOString(),
      ...response.data
    };

    // Log to file
    fs.appendFileSync('logs/metrics.log', JSON.stringify(metrics) + '\n');

    // Send to monitoring system
    // await sendToMonitoringSystem(metrics);
  } catch (error) {
    console.error('Failed to collect metrics:', error.message);
  }
}

setInterval(collectMetrics, 60000); // Every minute
EOF
```

### Database Monitoring

```javascript
// MongoDB monitoring queries
const mongoose = require("mongoose");

// Connection monitoring
mongoose.connection.on("connected", () => {
  console.log("MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

// Performance monitoring
setInterval(async () => {
  const stats = await mongoose.connection.db.stats();
  console.log("DB Stats:", {
    collections: stats.collections,
    objects: stats.objects,
    dataSize: stats.dataSize,
    indexSize: stats.indexSize,
  });
}, 300000); // Every 5 minutes
```

## Performance Tuning

### Production Optimizations

#### MongoDB Configuration

```javascript
// Connection options for production
const mongooseOptions = {
  maxPoolSize: 20,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferCommands: false,
  bufferMaxEntries: 0,
  useNewUrlParser: true,
  useUnifiedTopology: true,
};
```

#### Queue Configuration

```json
{
  "parallelTasks": 100,
  "maxParallelTasks": 200,
  "minParallelTasks": 20,
  "targetQueueSize": 1000,
  "adaptiveConcurrency": true,
  "retryAttempts": 5,
  "horizonConcurrency": 20,
  "maxHorizonConcurrency": 40
}
```

### Load Testing

```bash
# Install load testing tools
npm install -g artillery

# Create load test configuration
cat > load-test.yml << 'EOF'
config:
  target: 'http://localhost:4010'
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 50
    - duration: 60
      arrivalRate: 100

scenarios:
  - name: "Health checks"
    weight: 30
    flow:
      - get:
          url: "/monitoring/health"

  - name: "Transaction submission"
    weight: 70
    flow:
      - post:
          url: "/tx"
          json:
            hash: "{{ $randomString() }}"
            network: 1
            xdr: "test-xdr"
            signatures: []
EOF

# Run load test
artillery run load-test.yml
```

## Security Considerations

### Production Security

1. **Database Security**

   - Use MongoDB Atlas or properly secured MongoDB
   - Enable authentication and authorization
   - Use encrypted connections (TLS)
   - Implement network security groups

2. **Application Security**
   - Enable rate limiting
   - Use HTTPS only in production
   - Implement proper CORS policies
   - Add security headers

```javascript
// Security middleware
const helmet = require("helmet");
app.use(helmet());

// Rate limiting
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
});
app.use("/api/", limiter);
```

3. **Infrastructure Security**
   - Use firewalls and security groups
   - Regular security updates
   - Monitor for vulnerabilities
   - Implement logging and auditing

## Rollback Procedures

### Rollback Plan

1. **Application Rollback**

   ```bash
   # Switch back to previous version
   pm2 reload refractor-api --update-env

   # Or with Docker
   docker-compose up -d --scale refractor-api=3 old-version
   ```

2. **Database Rollback**

   ```bash
   # Restore from backup if necessary
   mongorestore --uri="mongodb-uri" backup-folder/

   # Switch storage provider back to mongodb
   # Update app.config.json: "storage": "mongodb"
   ```

3. **Configuration Rollback**
   ```bash
   # Restore previous configuration
   cp app.config.json.backup app.config.json
   pm2 reload refractor-api
   ```

## Troubleshooting

### Common Production Issues

1. **Memory Leaks**

   ```bash
   # Monitor memory usage
   pm2 monit

   # Check for memory leaks
   node --inspect api.js
   ```

2. **Database Connection Issues**

   ```bash
   # Test connection
   node -e "
   const mongoose = require('mongoose');
   mongoose.connect(process.env.MONGODB_URI)
   .then(() => console.log('Connected'))
   .catch(err => console.error(err));
   "
   ```

3. **Queue Stalls**

   ```bash
   # Check queue status
   curl http://localhost:4010/monitoring/metrics

   # Restart if necessary
   curl -X POST http://localhost:4010/monitoring/queue/pause
   curl -X POST http://localhost:4010/monitoring/queue/resume
   ```

### Log Analysis

```bash
# Monitor application logs
tail -f logs/combined.log | grep ERROR

# Monitor queue metrics
tail -f logs/metrics.log | jq '.finalizer.metrics'

# Monitor database performance
grep "slow operation" logs/combined.log
```

## Post-Deployment Validation

### Validation Checklist

- [ ] Health check endpoint responding
- [ ] Metrics endpoint providing data
- [ ] Transaction processing working
- [ ] Queue processing efficiently
- [ ] Database operations performing well
- [ ] Error rates within acceptable limits
- [ ] Performance metrics meeting SLAs

### Performance Baselines

Record these metrics after deployment:

- Average transaction processing time
- Queue throughput (transactions/second)
- Database query performance
- Memory and CPU usage
- Error rates

## Maintenance

### Regular Maintenance Tasks

1. **Weekly**

   - Review error logs
   - Check queue performance
   - Monitor database growth
   - Validate backup integrity

2. **Monthly**

   - Update dependencies (security patches)
   - Review and clean old logs
   - Analyze performance trends
   - Capacity planning review

3. **Quarterly**
   - Performance testing
   - Security audit
   - Configuration review
   - Disaster recovery testing
