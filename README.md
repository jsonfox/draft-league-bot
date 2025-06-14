# Draft League Bot Server

[![CI Pipeline](https://github.com/jsonFox/draft-league-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/jsonFox/draft-league-bot/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/badge/security-audited-brightgreen)](https://github.com/jsonFox/draft-league-bot/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-18.x%20%7C%2020.x-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

**NEW**: Rebuilt Discord client logic to better manage connection to Discord gateway with enhanced stability, health monitoring, and security features.

This server is a containerized microservice application for the Draft League ecosystem. It provides Discord bot functionality, health monitoring, and public status endpoints while maintaining high availability and security standards.

Built without frameworks like Discord.js and Express to demonstrate custom implementations and provide educational value.

## 🚀 Features

### ✅ Core Features:

- ✅ **Discord Gateway Client** - Custom Discord bot implementation with stability improvements
- ✅ **HTTP Server** - Custom Express-like framework with middleware support
- ✅ **Health Monitoring** - Comprehensive health checks suitable for public status pages
- ✅ **Security** - Rate limiting, CORS, input validation, and audit logging
- ✅ **Analytics** - Server metrics and Discord gateway statistics
- ✅ **Graceful Shutdown** - Proper cleanup with Discord notifications
- ✅ **Comprehensive Testing** - Full test suite with CI/CD integration
- ✅ **Type Safety** - Full TypeScript implementation with custom validators

### 🔧 Middleware System:

- ✅ **Body Parser** - JSON and URL-encoded request parsing
- ✅ **CORS** - Cross-origin resource sharing support
- ✅ **Rate Limiting** - 100 requests per minute per IP
- ✅ **Logging** - Structured request/response logging
- ✅ **Error Handling** - Centralized error management

### 🔒 Security Features:

- ✅ **Input Validation** - Custom validator system with type safety
- ✅ **Audit Logging** - Discord channel notifications for security events
- ✅ **Environment Protection** - Secure environment variable handling
- ✅ **Error Sanitization** - Safe error messages for production

## 📊 Public Endpoints

### Health Status

```
GET /health
```

Returns basic health status suitable for public monitoring:

```json
{
  "status": "healthy",
  "uptime": 86400,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

### Analytics

```
GET /analytics
```

Returns public server metrics:

```json
{
  "server": {
    "uptime": 86400,
    "requests_total": 1500,
    "errors_total": 3
  },
  "discord": {
    "status": "connected",
    "uptime": 86340,
    "events_processed": 245
  }
}
```

## 🔧 Technical Architecture

### Discord Client

**Problem**: Discord interactions have a 3-second timeout window. Serverless function cold starts would sometimes exceed this window, causing interaction failures.

**Solution**: Persistent Discord gateway connection that:

- Immediately acknowledges interactions with deferred responses
- Forwards interaction payloads to main application via REST
- Handles error states and user feedback
- Maintains connection stability with automatic reconnection

**Stability Features**:

- Exponential backoff for reconnection (max 10 attempts)
- Health monitoring for stalled connections
- Automatic reconnection on heartbeat failures
- Enhanced error reporting via audit log system
- Prevention of reconnection loops

### HTTP Server

**Problem**: Need for WebSocket support and custom middleware in serverless environment.

**Solution**: Custom HTTP server framework featuring:

- Express-like middleware system
- Built-in security and rate limiting
- Health monitoring endpoints
- WebSocket support for real-time features
- Graceful shutdown handling

### Data Validation

**Problem**: Need for robust input validation without external dependencies.

**Solution**: Custom validation library inspired by Zod providing:

- Type-safe environment variable validation
- Runtime input validation with TypeScript support
- Array validation with element type checking
- Optional field handling for undefined values
- Detailed error messages with context
- Input sanitization for security

### Testing

The project includes comprehensive tests:

- Unit tests for all utilities
- Integration tests for HTTP endpoints
- Discord client connection tests
- Middleware functionality tests
- Validator system tests

### Health Check Configuration

The `/health` endpoint provides detailed status information:

- **Server Status**: HTTP server health
- **Discord Status**: Gateway connection state
- **Memory Usage**: Current memory consumption
- **Uptime**: Service uptime in seconds
- **Error Counts**: Recent error statistics

### Health Monitoring

For production monitoring, use these endpoints:

- **Public Health**: `GET /health` - Safe for public status pages
- **Detailed Health**: `GET /health/detailed` - Requires authentication
- **Analytics**: `GET /analytics` - Public server metrics
- **Internal Analytics**: `GET /analytics/internal` - Detailed metrics

### Development Guidelines

- Write tests for new features
- Follow TypeScript best practices
- Use the existing validation system
- Update documentation for API changes
- Ensure all CI checks pass
