/**
 * Simple test script for authentication endpoints
 * Run with: node test-auth.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001';
const API_BASE = `${BASE_URL}/v1`;

let accessToken = null;
let userId = null;

async function testAuth() {
  console.log('🧪 Testing Authentication Endpoints...\n');
  
  try {
    // Test 1: Signup
    console.log('1️⃣ Testing Signup...');
    const signupData = {
      email: `test${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Test User'
    };
    
    try {
      const signupRes = await axios.post(`${API_BASE}/auth/signup`, signupData);
      console.log('✅ Signup successful');
      console.log('   User ID:', signupRes.data.data.user._id);
      console.log('   Access Token:', signupRes.data.data.accessToken ? 'Present' : 'Missing');
      accessToken = signupRes.data.data.accessToken;
      userId = signupRes.data.data.user._id;
    } catch (error) {
      console.log('❌ Signup failed:', error.response?.data || error.message);
      return;
    }
    
    // Test 2: Login
    console.log('\n2️⃣ Testing Login...');
    try {
      const loginRes = await axios.post(`${API_BASE}/auth/login`, {
        email: signupData.email,
        password: signupData.password
      });
      console.log('✅ Login successful');
      accessToken = loginRes.data.data.accessToken;
      console.log('   Access Token:', accessToken ? 'Present' : 'Missing');
    } catch (error) {
      console.log('❌ Login failed:', error.response?.data || error.message);
      return;
    }
    
    // Test 3: Get Current User (with auth)
    console.log('\n3️⃣ Testing Get Current User...');
    try {
      const meRes = await axios.get(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      console.log('✅ Get current user successful');
      console.log('   User:', meRes.data.data.user.name, `(${meRes.data.data.user.email})`);
    } catch (error) {
      console.log('❌ Get current user failed:', error.response?.data || error.message);
    }
    
    // Test 4: Get Profile
    console.log('\n4️⃣ Testing Get Profile...');
    try {
      const profileRes = await axios.get(`${API_BASE}/profile`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      console.log('✅ Get profile successful');
      console.log('   Profile:', JSON.stringify(profileRes.data.data.profile, null, 2));
    } catch (error) {
      console.log('❌ Get profile failed:', error.response?.data || error.message);
    }
    
    // Test 5: Update Profile
    console.log('\n5️⃣ Testing Update Profile...');
    try {
      const updateRes = await axios.put(`${API_BASE}/profile`, {
        major: 'Computer Science',
        skillLevel: 'Intermediate',
        learningType: 'Visual',
        daysPerWeek: 4,
        minutesPerSession: 45
      }, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      console.log('✅ Update profile successful');
      console.log('   Updated profile:', JSON.stringify(updateRes.data.data.profile, null, 2));
    } catch (error) {
      console.log('❌ Update profile failed:', error.response?.data || error.message);
    }
    
    // Test 6: Create Session (requires auth)
    console.log('\n6️⃣ Testing Create Session (with auth)...');
    try {
      const sessionRes = await axios.post(`${API_BASE}/sessions`, {
        phase: 'pre',
        mode: 'studying',
        topic: 'Test Topic'
      }, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      console.log('✅ Create session successful');
      console.log('   Session ID:', sessionRes.data.data.id);
      console.log('   Phase:', sessionRes.data.data.phase);
    } catch (error) {
      console.log('❌ Create session failed:', error.response?.data || error.message);
    }
    
    // Test 7: Refresh Token
    console.log('\n7️⃣ Testing Refresh Token...');
    try {
      const refreshRes = await axios.post(`${API_BASE}/auth/refresh`, {}, {
        withCredentials: true,
        headers: {
          Cookie: `refreshToken=${accessToken}` // This won't work without actual cookie, but testing endpoint
        }
      });
      console.log('✅ Refresh token successful');
      console.log('   New Access Token:', refreshRes.data.data.accessToken ? 'Present' : 'Missing');
    } catch (error) {
      console.log('⚠️ Refresh token test (expected to fail without cookie):', error.response?.status, error.response?.data?.error || error.message);
    }
    
    // Test 8: Logout
    console.log('\n8️⃣ Testing Logout...');
    try {
      const logoutRes = await axios.post(`${API_BASE}/auth/logout`, {}, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        withCredentials: true
      });
      console.log('✅ Logout successful');
    } catch (error) {
      console.log('❌ Logout failed:', error.response?.data || error.message);
    }
    
    // Test 9: Access Protected Route After Logout
    console.log('\n9️⃣ Testing Protected Route After Logout...');
    try {
      await axios.get(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      console.log('⚠️ Should have failed but succeeded');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly rejected after logout');
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }
    
    console.log('\n✅ All authentication tests completed!');
    
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

// Run tests
testAuth().catch(console.error);











