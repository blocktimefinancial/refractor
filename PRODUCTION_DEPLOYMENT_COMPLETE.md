# Refractor - Complete Production Deployment Guide

This comprehensive guide covers deploying the complete Refractor application stack, including both the API backend and React-based frontend UI, to a production environment.

## 🏗️ Architecture Overview

The Refractor application consists of three main components:

1. **API Backend** (`/api`) - Node.js Express server with Mongoose/MongoDB
2. **Frontend UI** (`/ui`) - React-based web application with webpack build
3. **API Documentation** - Auto-generated OpenAPI documentation

```
Production Architecture:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │────│  Web Server     │────│   API Server    │
│   (Nginx/ALB)   │    │  (Static Files) │    │   (Node.js)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                │                        │
                         ┌─────────────────┐    ┌─────────────────┐
                         │   CDN/Static    │    │   MongoDB       │
                         │   Assets        │    │   Database      │
                         └─────────────────┘    └─────────────────┘
```

## 📋 Pre-Deployment Checklist

### Infrastructure Requirements

- [ ] **Compute Resources**

  - VM/Container platform (AWS EC2, Google Cloud, Azure, etc.)
  - Minimum: 2 vCPUs, 4GB RAM, 20GB storage
  - Recommended: 4 vCPUs, 8GB RAM, 50GB storage

- [ ] **Database**

  - MongoDB Atlas (recommended) or self-hosted MongoDB cluster
  - Minimum: M10 cluster or equivalent
  - SSL/TLS enabled, authentication configured

- [ ] **Network & Security**

  - Domain name and SSL certificates
  - Load balancer or reverse proxy (Nginx recommended)
  - Firewall rules configured
  - CDN setup (optional but recommended)

- [ ] **Monitoring & Logging**
  - Application monitoring (DataDog, New Relic, etc.)
  - Log aggregation (ELK stack, CloudWatch, etc.)
  - Error tracking (Sentry, Bugsnag, etc.)

### Software Dependencies

- [ ] **Node.js** v18+ LTS
- [ ] **pnpm** (package manager)
- [ ] **Nginx** (web server/reverse proxy)
- [ ] **PM2** (process manager)
- [ ] **Git** (version control)

## 🚀 Deployment Process

### Step 1: Environment Setup

#### 1.1 Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js v18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm globally
npm install -g pnpm

# Install PM2 process manager
npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install build tools
sudo apt install build-essential git -y
```

#### 1.2 User and Directory Setup

```bash
# Create application user
sudo useradd -m -s /bin/bash refractor
sudo usermod -aG sudo refractor

# Create application directories
sudo mkdir -p /opt/refractor
sudo chown refractor:refractor /opt/refractor

# Switch to application user
sudo su - refractor
```

### Step 2: Application Deployment

#### 2.1 Code Deployment

```bash
# Clone repository
cd /opt/refractor
git clone https://github.com/stellar-expert/refractor.git .

# Or deploy from CI/CD pipeline
# rsync -avz --delete ./build/ refractor@server:/opt/refractor/
```

#### 2.2 API Backend Setup

```bash
# Navigate to API directory
cd /opt/refractor/api

# Install dependencies
pnpm install --frozen-lockfile --prod

# Create production configuration
cp app.config.json app.config.production.json

# Edit production configuration
nano app.config.production.json
```

**Production API Configuration** (`app.config.production.json`):

```json
{
  "port": 4010,
  "trustProxy": true,
  "storage": "mongoose",
  "db": "mongodb+srv://username:password@cluster.mongodb.net/refractor-prod?retryWrites=true&w=majority",
  "parallelTasks": 100,
  "maxParallelTasks": 200,
  "minParallelTasks": 20,
  "targetQueueSize": 1000,
  "tickerTimeout": 3000,
  "adaptiveConcurrency": true,
  "retryAttempts": 5,
  "retryDelay": 2000,
  "horizonConcurrency": 20,
  "maxHorizonConcurrency": 40,
  "adaptiveHorizonConcurrency": true,
  "horizonRetryAttempts": 7,
  "horizonRetryDelay": 3000,
  "metricsInterval": 30000,
  "networks": {
    "public": {
      "horizon": "https://horizon.stellar.org",
      "network": "PUBLIC",
      "passphrase": "Public Global Stellar Network ; September 2015",
      "coredb": {
        "user": "stellar",
        "host": "127.0.0.1",
        "database": "stellar-core",
        "password": ""
      }
    },
    "testnet": {
      "horizon": "https://horizon-testnet.stellar.org",
      "network": "TESTNET",
      "passphrase": "Test SDF Network ; September 2015",
      "coredb": {
        "user": "stellar",
        "host": "127.0.0.1",
        "database": "stellar-testnet",
        "password": ""
      }
    }
  }
}
```

#### 2.3 Frontend UI Setup

```bash
# Navigate to UI directory
cd /opt/refractor/ui

# Install dependencies
pnpm install --frozen-lockfile

# Create production environment file
cat > .env.production << EOF
API_ORIGIN=https://api.yourdomain.com
NODE_ENV=production
EOF

# Build production assets
pnpm run build

# The built files will be in /opt/refractor/ui/public/
```

#### 2.4 Database Migration

```bash
# Navigate back to API directory
cd /opt/refractor/api

# Run database migration (if upgrading from raw MongoDB)
NODE_ENV=production node scripts/migrate-to-mongoose.js --dry-run-only

# If dry run successful, run actual migration
NODE_ENV=production node scripts/migrate-to-mongoose.js
```

### Step 3: Process Management with PM2

#### 3.1 PM2 Configuration

Create PM2 ecosystem file (`/opt/refractor/ecosystem.config.js`):

```javascript
module.exports = {
  apps: [
    {
      name: "refractor-api",
      script: "./api/api.js",
      cwd: "/opt/refractor",
      instances: 4,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "development",
        CONFIG_PATH: "./api/app.config.json",
      },
      env_production: {
        NODE_ENV: "production",
        CONFIG_PATH: "./api/app.config.production.json",
        PORT: 4010,
        UV_THREADPOOL_SIZE: 128,
      },
      error_file: "/var/log/refractor/api-err.log",
      out_file: "/var/log/refractor/api-out.log",
      log_file: "/var/log/refractor/api-combined.log",
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "1G",
      watch: false,
      kill_timeout: 5000,
      restart_delay: 1000,
    },
  ],
};
```

#### 3.2 Start Application

```bash
# Create log directory
sudo mkdir -p /var/log/refractor
sudo chown refractor:refractor /var/log/refractor

# Start application with PM2
cd /opt/refractor
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the instructions to run the generated command with sudo

# Monitor application
pm2 monit
```

### Step 4: Web Server Configuration (Nginx)

#### 4.1 Nginx Configuration

Create Nginx configuration (`/etc/nginx/sites-available/refractor`):

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=api_strict:10m rate=10r/m;

# Upstream API servers
upstream refractor_api {
    least_conn;
    server 127.0.0.1:4010 max_fails=3 fail_timeout=30s;
    # Add more API servers for load balancing
    # server 127.0.0.1:4011 max_fails=3 fail_timeout=30s;
}

# HTTPS redirect
server {
    listen 80;
    server_name refractor.yourdomain.com api.refractor.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# Main application server
server {
    listen 443 ssl http2;
    server_name refractor.yourdomain.com;

    # SSL Configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_session_timeout 1d;
    ssl_session_cache shared:MozTLS:10m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://horizon.stellar.org https://horizon-testnet.stellar.org; frame-ancestors 'none'" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Vary Accept-Encoding;

        # Serve from UI public directory
        root /opt/refractor/ui/public;
        try_files $uri =404;
    }

    # API documentation
    location /openapi.html {
        root /opt/refractor/ui/public;
        expires 1h;
        add_header Cache-Control "public";
    }

    # Serve React application
    location / {
        root /opt/refractor/ui/public;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public";
    }

    # Health check endpoint (bypass rate limiting)
    location /health {
        access_log off;
        proxy_pass http://refractor_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API server
server {
    listen 443 ssl http2;
    server_name api.refractor.yourdomain.com;

    # SSL Configuration (same as above)
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_session_timeout 1d;
    ssl_session_cache shared:MozTLS:10m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # CORS headers for API
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept" always;

    # Rate limiting for different endpoints
    location /tx {
        limit_req zone=api_strict burst=5 nodelay;
        proxy_pass http://refractor_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /monitoring {
        # Restrict access to monitoring endpoints
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;

        proxy_pass http://refractor_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Default API endpoints
    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://refractor_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Handle preflight requests
    location ~* OPTIONS {
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept";
        add_header Content-Length 0;
        return 204;
    }
}
```

#### 4.2 Enable Nginx Configuration

```bash
# Test configuration
sudo nginx -t

# Enable site
sudo ln -s /etc/nginx/sites-available/refractor /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Step 5: SSL Certificate Setup

#### 5.1 Using Let's Encrypt (Certbot)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificates
sudo certbot --nginx -d refractor.yourdomain.com -d api.refractor.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run

# Set up auto-renewal cron job
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

#### 5.2 Using Custom Certificates

```bash
# Create SSL directory
sudo mkdir -p /etc/ssl/refractor

# Copy certificates
sudo cp your-certificate.pem /etc/ssl/refractor/cert.pem
sudo cp your-private-key.key /etc/ssl/refractor/private.key

# Set proper permissions
sudo chmod 600 /etc/ssl/refractor/private.key
sudo chmod 644 /etc/ssl/refractor/cert.pem
```

## 🐳 Docker Deployment Option

### Docker Configuration

#### API Dockerfile (`/opt/refractor/api/Dockerfile`):

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S refractor -u 1001

# Change ownership
RUN chown -R refractor:nodejs /app
USER refractor

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4010/monitoring/health || exit 1

# Expose port
EXPOSE 4010

# Start application
CMD ["node", "api.js"]
```

#### UI Dockerfile (`/opt/refractor/ui/Dockerfile`):

```dockerfile
FROM node:18-alpine as build

# Set working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build application
ARG API_ORIGIN=https://api.refractor.yourdomain.com
ENV API_ORIGIN=$API_ORIGIN
RUN pnpm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=build /app/public /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

#### Docker Compose Configuration (`docker-compose.prod.yml`):

```yaml
version: "3.8"

services:
  refractor-api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: refractor-api
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=4010
    ports:
      - "4010:4010"
    volumes:
      - ./api/app.config.production.json:/app/app.config.json:ro
      - api-logs:/app/logs
    networks:
      - refractor-network
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
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://localhost:4010/monitoring/health",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  refractor-ui:
    build:
      context: ./ui
      dockerfile: Dockerfile
      args:
        API_ORIGIN: https://api.refractor.yourdomain.com
    container_name: refractor-ui
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/ssl/certs:ro
      - ui-logs:/var/log/nginx
    networks:
      - refractor-network
    depends_on:
      - refractor-api
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://localhost:80/",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    container_name: refractor-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl/certs:ro
      - nginx-logs:/var/log/nginx
    networks:
      - refractor-network
    depends_on:
      - refractor-api
      - refractor-ui

volumes:
  api-logs:
  ui-logs:
  nginx-logs:

networks:
  refractor-network:
    driver: bridge
```

## 📊 Monitoring and Logging

### Application Monitoring

#### 1. PM2 Monitoring

```bash
# Monitor processes
pm2 monit

# View logs
pm2 logs refractor-api

# Get process info
pm2 info refractor-api

# Restart application
pm2 restart refractor-api
```

#### 2. Application Metrics

```bash
# Create monitoring script
cat > /opt/refractor/scripts/monitor.sh << 'EOF'
#!/bin/bash

# Check API health
curl -f http://localhost:4010/monitoring/health > /dev/null
if [ $? -eq 0 ]; then
    echo "API health check: OK"
else
    echo "API health check: FAILED"
    # Send alert notification
fi

# Check queue metrics
QUEUE_LENGTH=$(curl -s http://localhost:4010/monitoring/metrics | jq '.finalizer.metrics.queueLength')
if [ "$QUEUE_LENGTH" -gt 1000 ]; then
    echo "WARNING: Queue length is $QUEUE_LENGTH"
    # Send alert notification
fi

# Check error rate
ERROR_RATE=$(curl -s http://localhost:4010/monitoring/metrics | jq '.finalizer.metrics.successRate')
if [ "$(echo "$ERROR_RATE < 0.95" | bc)" -eq 1 ]; then
    echo "WARNING: Success rate is $ERROR_RATE"
    # Send alert notification
fi
EOF

chmod +x /opt/refractor/scripts/monitor.sh

# Add to crontab for regular checks
echo "*/5 * * * * /opt/refractor/scripts/monitor.sh" | crontab -
```

#### 3. Log Management

```bash
# Setup log rotation
sudo cat > /etc/logrotate.d/refractor << 'EOF'
/var/log/refractor/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 refractor refractor
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Setup centralized logging (optional)
# Install Filebeat or similar log shipper
```

### Performance Monitoring

#### 1. Database Monitoring

```javascript
// Add to API startup (api.js)
const mongoose = require("mongoose");

// Monitor connection events
mongoose.connection.on("connected", () => {
  console.log("MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err);
  // Send alert notification
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
  // Send alert notification
});

// Monitor slow queries
mongoose.set("debug", (collectionName, method, query, doc) => {
  const start = Date.now();
  console.log(`MongoDB ${method} on ${collectionName}:`, query);

  // Log slow queries
  process.nextTick(() => {
    const duration = Date.now() - start;
    if (duration > 100) {
      // Log queries taking more than 100ms
      console.warn(`Slow query detected: ${duration}ms`);
    }
  });
});
```

#### 2. System Metrics Collection

```bash
# Install system monitoring tools
sudo apt install htop iotop netstat-nat -y

# Create system metrics collection script
cat > /opt/refractor/scripts/system-metrics.sh << 'EOF'
#!/bin/bash

# Collect system metrics
echo "Timestamp: $(date)"
echo "CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')"
echo "Memory Usage: $(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')"
echo "Disk Usage: $(df -h / | awk 'NR==2 {print $5}')"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"

# API specific metrics
echo "API Process Count: $(pgrep -f "refractor-api" | wc -l)"
echo "Database Connections: $(netstat -an | grep :27017 | wc -l)"

echo "---"
EOF

chmod +x /opt/refractor/scripts/system-metrics.sh

# Run every minute and log to file
echo "* * * * * /opt/refractor/scripts/system-metrics.sh >> /var/log/refractor/system-metrics.log" | crontab -
```

## 🔧 Maintenance and Operations

### Regular Maintenance Tasks

#### 1. Database Maintenance

```bash
# Create database maintenance script
cat > /opt/refractor/scripts/db-maintenance.sh << 'EOF'
#!/bin/bash

cd /opt/refractor/api

# Clean up expired transactions
echo "Cleaning up expired transactions..."
curl -X POST http://localhost:4010/monitoring/cleanup/expired

# Run database optimization (if needed)
# node scripts/optimize-database.js

echo "Database maintenance completed at $(date)"
EOF

chmod +x /opt/refractor/scripts/db-maintenance.sh

# Schedule weekly maintenance
echo "0 2 * * 0 /opt/refractor/scripts/db-maintenance.sh" | crontab -
```

#### 2. Application Updates

```bash
# Create update script
cat > /opt/refractor/scripts/deploy-update.sh << 'EOF'
#!/bin/bash

set -e

echo "Starting application update..."

# Backup current version
cp -r /opt/refractor /opt/refractor-backup-$(date +%Y%m%d-%H%M%S)

# Pull latest code
cd /opt/refractor
git fetch origin
git checkout main
git pull origin main

# Update API dependencies
cd api
pnpm install --frozen-lockfile --prod

# Rebuild UI
cd ../ui
pnpm install --frozen-lockfile
pnpm run build

# Restart API
pm2 restart refractor-api

# Test health
sleep 10
curl -f http://localhost:4010/monitoring/health

echo "Application update completed successfully"
EOF

chmod +x /opt/refractor/scripts/deploy-update.sh
```

### Backup Procedures

#### 1. Database Backup

```bash
# Create backup script
cat > /opt/refractor/scripts/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/backups/refractor"
DATE=$(date +%Y%m%d-%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup MongoDB (if using local instance)
# mongodump --host localhost --port 27017 --db refractor --out $BACKUP_DIR/mongo-$DATE

# Backup application configuration
cp /opt/refractor/api/app.config.production.json $BACKUP_DIR/config-$DATE.json

# Backup application code (if modified)
tar -czf $BACKUP_DIR/app-$DATE.tar.gz /opt/refractor

# Upload to cloud storage (AWS S3, Google Cloud Storage, etc.)
# aws s3 cp $BACKUP_DIR/ s3://your-backup-bucket/refractor/ --recursive

# Clean up old backups (keep last 30 days)
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/refractor/scripts/backup.sh

# Schedule daily backups
echo "0 1 * * * /opt/refractor/scripts/backup.sh" | crontab -
```

#### 2. Restore Procedures

```bash
# Create restore script
cat > /opt/refractor/scripts/restore.sh << 'EOF'
#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: $0 <backup-date>"
    echo "Available backups:"
    ls -la /opt/backups/refractor/
    exit 1
fi

BACKUP_DATE=$1
BACKUP_DIR="/opt/backups/refractor"

echo "Restoring from backup: $BACKUP_DATE"

# Stop application
pm2 stop refractor-api

# Restore configuration
cp $BACKUP_DIR/config-$BACKUP_DATE.json /opt/refractor/api/app.config.production.json

# Restore application code (if needed)
# tar -xzf $BACKUP_DIR/app-$BACKUP_DATE.tar.gz -C /

# Restore database (if needed)
# mongorestore --host localhost --port 27017 --db refractor $BACKUP_DIR/mongo-$BACKUP_DATE/refractor

# Start application
pm2 start refractor-api

echo "Restore completed"
EOF

chmod +x /opt/refractor/scripts/restore.sh
```

## 🚨 Troubleshooting

### Common Issues and Solutions

#### 1. Application Won't Start

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs refractor-api

# Check configuration
node -e "console.log(require('/opt/refractor/api/app.config.production.json'))"

# Test database connection
cd /opt/refractor/api
node -e "
const mongoose = require('mongoose');
const config = require('./app.config.production.json');
mongoose.connect(config.db).then(() => {
  console.log('Database connection successful');
  process.exit(0);
}).catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});
"
```

#### 2. High Memory Usage

```bash
# Check memory usage
pm2 monit

# Restart application with memory limit
pm2 restart refractor-api --max-memory-restart 1G

# Check for memory leaks
node --inspect /opt/refractor/api/api.js
```

#### 3. Database Connection Issues

```bash
# Check MongoDB connectivity
mongosh "mongodb+srv://username:password@cluster.mongodb.net/refractor-prod"

# Check network connectivity
telnet cluster.mongodb.net 27017

# Review connection logs
pm2 logs refractor-api | grep -i mongo
```

#### 4. Queue Processing Issues

```bash
# Check queue status
curl http://localhost:4010/monitoring/metrics | jq '.finalizer'

# Pause queue for maintenance
curl -X POST http://localhost:4010/monitoring/queue/pause

# Resume queue
curl -X POST http://localhost:4010/monitoring/queue/resume

# Adjust concurrency
curl -X POST http://localhost:4010/monitoring/queue/concurrency \
  -H "Content-Type: application/json" \
  -d '{"concurrency": 25}'
```

### Performance Troubleshooting

#### 1. Slow API Responses

```bash
# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:4010/monitoring/health

# Create curl timing format file
cat > curl-format.txt << 'EOF'
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
EOF

# Profile API endpoints
ab -n 100 -c 10 http://localhost:4010/monitoring/health
```

#### 2. Database Performance Issues

```bash
# Check slow queries
# Enable MongoDB profiling and review slow operations

# Check index usage
# Review MongoDB Atlas performance insights

# Optimize queries
node /opt/refractor/api/scripts/analyze-queries.js
```

## 🔒 Security Considerations

### Production Security Checklist

- [ ] **Database Security**

  - [ ] MongoDB authentication enabled
  - [ ] Database network access restricted
  - [ ] Connection string encrypted
  - [ ] Regular security updates applied

- [ ] **Application Security**

  - [ ] HTTPS enforced
  - [ ] Security headers configured
  - [ ] Input validation enabled
  - [ ] Rate limiting active
  - [ ] CORS properly configured

- [ ] **Infrastructure Security**

  - [ ] Firewall rules configured
  - [ ] SSH access restricted
  - [ ] Security groups/ACLs configured
  - [ ] Regular OS updates applied
  - [ ] Monitoring and logging enabled

- [ ] **API Security**
  - [ ] Authentication implemented (if required)
  - [ ] Request validation active
  - [ ] Error handling secure
  - [ ] Monitoring endpoints restricted

### Security Hardening

```bash
# 1. System hardening
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# 2. Fail2ban for SSH protection
sudo apt install fail2ban -y
sudo systemctl enable fail2ban

# 3. Automatic security updates
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades

# 4. File permissions
sudo chmod 600 /opt/refractor/api/app.config.production.json
sudo chown refractor:refractor /opt/refractor -R
```

## 📈 Scaling Considerations

### Horizontal Scaling

#### 1. Load Balancer Configuration

```nginx
# Multiple API instances
upstream refractor_api {
    least_conn;
    server 10.0.1.10:4010 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:4010 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:4010 max_fails=3 fail_timeout=30s;
}
```

#### 2. Database Scaling

- **MongoDB Atlas**: Use cluster auto-scaling
- **Replica Sets**: Configure read replicas for read scaling
- **Sharding**: For very large datasets

#### 3. CDN Integration

```nginx
# Serve static assets from CDN
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    # Redirect to CDN
    return 301 https://cdn.yourdomain.com$request_uri;
}
```

### Monitoring at Scale

#### 1. Centralized Logging

```yaml
# ELK Stack example (docker-compose.elk.yml)
version: "3.8"
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.15.0
    environment:
      - discovery.type=single-node
    ports:
      - "9200:9200"

  logstash:
    image: docker.elastic.co/logstash/logstash:7.15.0
    ports:
      - "5044:5044"

  kibana:
    image: docker.elastic.co/kibana/kibana:7.15.0
    ports:
      - "5601:5601"
```

#### 2. Application Performance Monitoring

```javascript
// Add APM integration (New Relic example)
if (process.env.NODE_ENV === "production") {
  require("newrelic");
}

// Or DataDog
const tracer = require("dd-trace").init({
  service: "refractor-api",
  env: process.env.NODE_ENV,
});
```

## 🎯 Success Metrics

### Key Performance Indicators

1. **Availability**: > 99.9% uptime
2. **Response Time**: < 200ms for health checks, < 2s for transaction processing
3. **Throughput**: Handle target transactions per second
4. **Error Rate**: < 1% error rate
5. **Queue Processing**: Average queue depth < 100 transactions

### Monitoring Dashboard

Create monitoring dashboard with:

- Application uptime and response times
- Database performance metrics
- Queue processing statistics
- Error rates and trends
- System resource utilization

This comprehensive production deployment guide covers all aspects of deploying the Refractor application stack in a production environment, from initial setup to ongoing maintenance and scaling considerations.
