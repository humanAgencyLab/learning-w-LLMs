# Learning with LLMs - Backend API

A robust Express.js backend API for the Study Assist learning platform, featuring LLM integration, session management, and comprehensive security measures.

## Setup

1. Copy `.env.example` to `.env` and fill in your secrets:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server (auto-restarts when you save `.js` / `.json` changes):
   ```bash
   npm run dev
   ```
   Uses [nodemon](https://nodemon.io/) (`nodemon.json` ignores `uploads/`, `tests/`, etc. so uploads don’t bounce the server).

4. Start the production server:
   ```bash
   npm start
   ```

## Environment Variables

- `PORT`: Server port (default: 5001)
- `MONGODB_URI`: MongoDB connection string
- `CORS_ORIGINS`: Comma-separated list of allowed CORS origins
- `LLM_PROVIDER`: LLM provider (groq, openai)
- `LLM_MODEL`: Model name to use
- `GROQ_API_KEY`: Groq API key
- `OPENAI_API_KEY`: OpenAI API key

## API Endpoints

- `GET /v1/health` - Health check
- `GET /v1/ready` - Readiness check (includes DB connectivity)
- `GET /api-docs` - API documentation

## Security & Environment

### Security Features

The backend implements comprehensive security measures to protect against common vulnerabilities:

#### Helmet Security Headers
- **Content Security Policy (CSP)**: Prevents XSS attacks
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **Strict-Transport-Security**: Enforces HTTPS
- **X-DNS-Prefetch-Control**: Controls DNS prefetching

#### Rate Limiting
- **60 requests per minute** per IP address
- **Sliding window** rate limiting algorithm
- **Custom headers** for rate limit information
- **Graceful degradation** with informative error messages

#### CORS Configuration
- **Allowlist-based** CORS origins (no wildcards)
- **Configurable** via `CORS_ORIGINS` environment variable
- **Credentials support** for authenticated requests
- **Preflight handling** for complex requests

#### Request Security
- **Request ID tracking** with UUID for debugging
- **JSON body size limits** (1MB maximum)
- **Input validation** and sanitization
- **Error handling** without information leakage

### Environment Configuration

#### Required Environment Variables
```env
# Server Configuration
PORT=5001

# Database
MONGODB_URI=mongodb://localhost:27017/studyassist

# CORS Configuration (comma-separated, no spaces)
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# LLM Provider Configuration
LLM_PROVIDER=groq
LLM_MODEL=llama3.1

# API Keys (keep these secure!)
GROQ_API_KEY=your_groq_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

#### Environment Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use different keys** for development and production
3. **Rotate API keys** regularly
4. **Use environment-specific** CORS origins
5. **Monitor API usage** and set up alerts
6. **Use strong, unique** API keys

#### Development vs Production

**Development:**
- CORS allows `http://localhost:3000`
- Detailed error messages
- Debug logging enabled
- No HTTPS enforcement

**Production:**
- CORS allows only your domain(s)
- Sanitized error messages
- Info-level logging
- HTTPS enforcement via Helmet

### Logging & Monitoring

#### Request Logging
- **Morgan** for development (human-readable logs)
- **Winston** for production (structured JSON logs)
- **Request ID tracking** for debugging
- **Error stack traces** in development

#### Health Monitoring
- **`/v1/health`**: Basic health check
- **`/v1/ready`**: Readiness check with DB connectivity
- **Response time tracking**
- **Error rate monitoring**

#### Security Monitoring
- **Rate limit violations** logged
- **CORS violations** tracked
- **Invalid API key attempts** monitored
- **Suspicious request patterns** flagged

### Database Security

#### MongoDB Configuration
- **Connection string** from environment variables
- **Index optimization** for performance
- **Data validation** at schema level
- **Connection pooling** for efficiency

#### Data Protection
- **No sensitive data** in logs
- **Encrypted connections** (TLS)
- **Input sanitization** before database operations
- **Query parameterization** to prevent injection

### API Security

#### Authentication (Phase 1)
- **JWT tokens** for session management
- **bcrypt** for password hashing
- **CSRF protection** for state-changing operations
- **Session timeout** and refresh mechanisms

#### Input Validation
- **Request body validation** with Joi/Zod
- **Parameter sanitization** and type checking
- **File upload restrictions** and validation
- **SQL injection prevention** (NoSQL injection)

### Deployment Security

#### Production Checklist
- [ ] Environment variables secured
- [ ] API keys rotated and unique
- [ ] CORS origins restricted to production domains
- [ ] HTTPS enforced
- [ ] Rate limiting configured appropriately
- [ ] Database connections encrypted
- [ ] Error messages sanitized
- [ ] Logging configured for production
- [ ] Health checks monitoring
- [ ] Security headers active

#### Security Headers Verification
```bash
# Check security headers
curl -I http://localhost:5001/v1/health

# Expected headers:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-DNS-Prefetch-Control: off
# Strict-Transport-Security: max-age=15552000; includeSubDomains
```

### Troubleshooting Security Issues

#### Common Security Problems

1. **CORS errors**
   - Check `CORS_ORIGINS` includes your frontend URL
   - Ensure no trailing slashes in origins
   - Verify protocol (http vs https) matches

2. **Rate limiting issues**
   - Check if you're hitting the 60/minute limit
   - Implement client-side rate limiting
   - Consider increasing limits for authenticated users

3. **API key errors**
   - Verify keys are set in `.env` file
   - Check key format and validity
   - Ensure keys have proper permissions

4. **Database connection issues**
   - Verify `MONGODB_URI` format
   - Check MongoDB is running
   - Ensure network connectivity

#### Security Testing

```bash
# Test rate limiting
for i in {1..65}; do curl http://localhost:5001/v1/health; done

# Test CORS
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     http://localhost:5001/v1/health

# Test security headers
curl -I http://localhost:5001/v1/health
```

## Development

### Project Structure
```
backend/
├── models/           # MongoDB schemas
├── routes/           # API route handlers
├── middleware/       # Security & optimization middleware
├── prompts/          # LLM prompt templates
├── server.js         # Main server file
└── package.json      # Dependencies and scripts
```

### Available Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server (if available)
- `npm run lint` - Run ESLint
- `npm test` - Run tests (if available)

### API Documentation
Visit `http://localhost:5001/api-docs` for interactive API documentation powered by Swagger UI.

## Contributing

1. Follow the security best practices outlined above
2. Test all security features before submitting PRs
3. Update documentation for any security changes
4. Ensure environment variables are properly documented
5. Test both development and production configurations