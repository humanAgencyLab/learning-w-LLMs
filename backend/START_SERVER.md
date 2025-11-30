# Starting the Backend Server

## ✅ No Blocking Issues Found

The server can start successfully. All modules load correctly.

## 🚀 Quick Start

### Option 1: Start Fresh Server

```bash
cd backend
npm start
```

### Option 2: Development Mode (with auto-reload)

```bash
cd backend
npm run dev
```

## ⚠️ Prerequisites

Make sure these are set in `backend/.env`:

```env
# Required
GROQ_API_KEY=your_groq_api_key_here
MONGODB_URI=mongodb://localhost:27017/learning-w-llms

# Recommended (will use defaults if not set)
JWT_SECRET=your_jwt_secret_here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

## 🔍 If Server Won't Start

### Check MongoDB
```bash
# Check if MongoDB is running
pgrep -x mongod

# Start MongoDB if needed (macOS)
brew services start mongodb-community
```

### Check Port Availability
```bash
# Check if port 5001 is in use
lsof -ti:5001

# Kill process if needed
kill -9 $(lsof -ti:5001)
```

### Check Environment Variables
```bash
cd backend
node -e "require('dotenv').config(); console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'Set' : 'Missing');"
```

## 📝 Current Status

- ✅ All modules load successfully
- ✅ Routes are properly mounted
- ✅ No syntax errors
- ⚠️ Server needs restart to load new auth routes (current instance is ~9 days old)

## 🧪 After Starting Server

Test the endpoints:

```bash
# Health check
curl http://localhost:5001/v1/health

# Test signup
curl -X POST http://localhost:5001/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'
```

Or run the test script:
```bash
cd backend
./test-auth.sh
```








