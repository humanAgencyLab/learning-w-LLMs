#!/bin/bash

# Session Routes Test Runner
echo "🧪 Running Session Routes Tests..."

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is not running. Please start MongoDB first."
    echo "   You can start it with: brew services start mongodb-community"
    exit 1
fi

# Set test environment
export NODE_ENV=test
export MONGODB_TEST_URI=mongodb://localhost:27017/ai_edu_app_test

# Run tests
npm test

echo "✅ Tests completed!"

