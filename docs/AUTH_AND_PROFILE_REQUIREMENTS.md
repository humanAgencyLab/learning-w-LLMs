# Authentication & Profile Requirements Document

## Executive Summary

This document outlines the complete requirements for implementing authentication and user profile management in the Study Assist platform. The implementation will integrate with the existing MongoDB-based backend and React frontend, replacing the current dummy profile system with real user authentication.

---

## 1. Current State Analysis

### 1.1 Backend State
- **Main Application**: Uses MongoDB (Mongoose) for all data persistence
- **Session Model**: Already has `userId` field (optional, references 'User' model) but no User model exists
- **Legacy Auth**: Separate `NODE_LOGIN` directory with PostgreSQL + Passport.js (not integrated, uses different DB)
- **No Auth Middleware**: Main app has no authentication middleware or JWT handling
- **OpenAPI Spec**: Mentions JWT Bearer auth but not implemented

### 1.2 Frontend State
- **SignIn/SignUp Pages**: Exist but are mock implementations (just navigate, no API calls)
- **Profile Page**: UI exists with form fields but no backend integration
- **Settings Page**: UI exists but no backend integration
- **No Auth State**: No authentication state management (no user context/store)
- **No Protected Routes**: All routes are publicly accessible
- **Session Store**: Uses dummy profile data (`source: 'dummy'`)

### 1.3 Data Flow Issues
- Sessions are created without user association (`userId: null`)
- Profile data is passed in request body but not persisted to user account
- No way to retrieve user's learning history across sessions
- No user-specific preferences or settings persistence

---

## 2. Architecture Decisions

### 2.1 Database Choice: **MongoDB** ✅
**Decision**: Use MongoDB (already in use) for User model
**Rationale**:
- Main application already uses MongoDB for all models (Session, Quiz, ChatLog, etc.)
- Session model already references User via `userId` field
- Avoids dual-database complexity
- Consistent with existing codebase architecture

**Action**: Create User model in `backend/models/User.js` using Mongoose

### 2.2 Authentication Strategy: **JWT Tokens** ✅
**Decision**: Use JWT (JSON Web Tokens) for stateless authentication
**Rationale**:
- Stateless - no server-side session storage needed
- Scalable - works across multiple servers/instances
- Industry standard for REST APIs
- Works well with React SPA architecture
- OpenAPI spec already mentions JWT Bearer auth

**Implementation**:
- Access tokens: Short-lived (15-30 minutes) for API requests
- Refresh tokens: Long-lived (7-30 days) stored in httpOnly cookies
- Token refresh endpoint for seamless re-authentication

### 2.3 Password Security: **bcrypt** ✅
**Decision**: Use bcrypt for password hashing
**Rationale**:
- Industry standard for password hashing
- Already used in legacy NODE_LOGIN code
- Salt rounds: 10-12 (balance between security and performance)

---

## 3. Data Models

### 3.1 User Model Schema

```javascript
{
  _id: ObjectId,
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true,
    select: false  // Don't return password in queries by default
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  avatarUrl: {
    type: String,
    default: null  // Will store URL/path to avatar image
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null,
    select: false
  },
  passwordResetToken: {
    type: String,
    default: null,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  preferences: {
    defaultModel: {
      type: String,
      enum: ['llama-3.1-8b', 'llama-3.1-70b', 'mixtral-8x7b'],
      default: 'llama-3.1-8b'
    },
    explanationLength: {
      type: String,
      enum: ['concise', 'balanced', 'detailed'],
      default: 'balanced'
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    fontSize: {
      type: Number,
      min: 10,
      max: 50,
      default: 16
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  stats: {
    pointsTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    gemsTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    trophiesTotal: {
      type: Number,
      default: 0,
      min: 0
    },
    sessionsCompleted: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  createdAt: Date,
  updatedAt: Date,
  lastLoginAt: Date
}
```

**Indexes**:
- `email` (unique index)
- `emailVerificationToken` (sparse index)
- `passwordResetToken` (sparse index)

### 3.2 User Profile Schema (Embedded in User)

The profile data that currently exists in Session model should be stored in User model:

```javascript
profile: {
  source: {
    type: String,
    enum: ['user'],
    default: 'user'
  },
  background: {
    type: String,
    required: false,
    default: ''
  },
  goals: [{
    type: String,
    required: false
  }],
  strengths: [{
    type: String,
    required: false
  }],
  gaps: [{
    type: String,
    required: false
  }],
  timePerDayMins: {
    type: Number,
    min: 10,
    max: 480,
    default: 30
  },
  preferredStyle: {
    type: String,
    enum: ['examples-first', 'theory-first', 'mixed'],
    default: 'mixed'
  },
  // Enhanced fields from onboarding
  skillLevel: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    default: 'Beginner'
  },
  learningType: {
    type: String,
    enum: ['Visual', 'Auditory', 'Reading/Writing', 'Kinesthetic'],
    default: 'Visual'
  },
  major: {
    type: String,
    default: ''
  },
  currentCourses: [{
    type: String
  }],
  daysPerWeek: {
    type: Number,
    min: 1,
    max: 7,
    default: 3
  },
  minutesPerSession: {
    type: Number,
    min: 5,
    default: 30
  },
  recentTopics: [{
    type: String
  }],
  selfRating: {
    type: String,
    default: ''
  },
  primaryGoal: {
    type: String,
    default: ''
  },
  defaultMode: {
    type: String,
    enum: ['Studying', 'Revision'],
    default: 'Studying'
  },
  explanationLength: {
    type: String,
    enum: ['Concise', 'Balanced', 'Detailed'],
    default: 'Balanced'
  },
  examplesPreference: {
    type: String,
    enum: ['Few', 'Many', 'Balanced'],
    default: 'Balanced'
  },
  language: {
    type: String,
    default: 'English'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}
```

### 3.3 Session Model Updates

**Current**: `userId` field exists but is optional and null
**Required**: 
- Make `userId` required (remove optional/null support)
- Add index: `{ userId: 1, createdAt: -1 }` (already exists)
- When creating session, always link to authenticated user's `userId`
- Remove dummy profile support - all sessions must have authenticated user

---

## 4. API Endpoints

### 4.1 Authentication Endpoints

#### POST `/v1/auth/signup`
**Purpose**: Register a new user account
**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```
**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe",
      "emailVerified": false
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```
**Validation**:
- Email: valid format, unique
- Password: min 8 characters, at least one letter and one number
- Name: required, 1-100 characters

#### POST `/v1/auth/login`
**Purpose**: Authenticate user and return tokens
**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": null
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```
**Error Responses**:
- 401: Invalid email or password
- 429: Too many login attempts (rate limited)

#### POST `/v1/auth/refresh`
**Purpose**: Refresh access token using refresh token
**Request**: Refresh token in httpOnly cookie or Authorization header
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "accessToken": "new_jwt_access_token"
  }
}
```

#### POST `/v1/auth/logout`
**Purpose**: Invalidate refresh token and logout user
**Request**: Requires authentication
**Response** (200 OK):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### POST `/v1/auth/forgot-password`
**Purpose**: Request password reset email
**Request Body**:
```json
{
  "email": "user@example.com"
}
```
**Response** (200 OK):
```json
{
  "success": true,
  "message": "If email exists, password reset link has been sent"
}
```
**Note**: Always returns success (security best practice - don't reveal if email exists)

#### POST `/v1/auth/reset-password`
**Purpose**: Reset password using token from email
**Request Body**:
```json
{
  "token": "reset_token_from_email",
  "password": "newSecurePassword123"
}
```
**Response** (200 OK):
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

#### GET `/v1/auth/me`
**Purpose**: Get current authenticated user info
**Request**: Requires authentication (Bearer token)
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": null,
      "preferences": { ... },
      "stats": { ... }
    }
  }
}
```

### 4.2 Profile Endpoints

#### GET `/v1/sessions`
**Purpose**: Get list of all sessions for authenticated user
**Request**: Requires authentication
**Query Parameters**:
- `limit`: Number of sessions to return (default: 20)
- `offset`: Pagination offset (default: 0)
- `status`: Filter by phase - 'completed', 'in_progress', etc. (optional)
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "session_id",
        "topic": "JavaScript Fundamentals",
        "chatTitle": "Learning JS Basics",
        "phase": "learning",
        "progressPct": 45,
        "points": 45,
        "gems": 2,
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-15T11:30:00.000Z"
      }
    ],
    "total": 15,
    "limit": 20,
    "offset": 0
  }
}
```
**Note**: Only returns sessions where `userId` matches authenticated user

#### GET `/v1/sessions/:id`
**Purpose**: Get specific session details (for resuming)
**Request**: Requires authentication
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "session": {
      // Full session object including messages, plan, progress, etc.
    }
  }
}
```
**Error**: 403 if session userId doesn't match authenticated user

### 4.3 Onboarding Endpoints

#### POST `/v1/onboarding/step-1` (Profile Basics)
**Purpose**: Save step 1 of onboarding (Skill Level, Learning Type, Major)
**Request**: Requires authentication
**Request Body**:
```json
{
  "skillLevel": "Beginner",
  "learningType": "Visual",
  "major": "Computer Science"
}
```

#### POST `/v1/onboarding/step-2` (Course & Goal)
**Purpose**: Save step 2 of onboarding (Current Courses, Weekly Goals)
**Request**: Requires authentication
**Request Body**:
```json
{
  "currentCourses": ["Python Basics", "Data Structures"],
  "daysPerWeek": 3,
  "minutesPerSession": 40
}
```

#### POST `/v1/onboarding/step-3` (Background & Intent)
**Purpose**: Save step 3 of onboarding (Recent Topics, Self Rating, Primary Goal)
**Request**: Requires authentication
**Request Body**:
```json
{
  "recentTopics": ["programming basics", "algorithms"],
  "selfRating": "Basic",
  "primaryGoal": "Master Basics"
}
```

#### POST `/v1/onboarding/step-4` (Preferences)
**Purpose**: Save step 4 of onboarding (Default Mode, Explanation Length, Examples, Language)
**Request**: Requires authentication
**Request Body**:
```json
{
  "defaultMode": "Studying",
  "explanationLength": "Balanced",
  "examplesPreference": "Many",
  "language": "English"
}
```

#### POST `/v1/onboarding/complete`
**Purpose**: Mark onboarding as complete
**Request**: Requires authentication
**Response** (200 OK):
```json
{
  "success": true,
  "message": "Onboarding completed"
}
```

### 4.4 Profile Endpoints

#### GET `/v1/profile`
**Purpose**: Get user's complete profile (including learning profile)
**Request**: Requires authentication
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "profile": {
      "name": "John Doe",
      "email": "user@example.com",
      "avatarUrl": null,
      "background": "...",
      "goals": [...],
      "strengths": [...],
      "gaps": [...],
      "timePerDayMins": 40,
      "preferredStyle": "examples-first",
      "skillLevel": "Intermediate",
      "learningType": "Visual",
      "major": "Computer Science",
      "currentCourses": [...],
      // ... all profile fields
    },
    "preferences": { ... },
    "stats": { ... }
  }
}
```

#### PUT `/v1/profile`
**Purpose**: Update user profile (all fields)
**Request**: Requires authentication
**Request Body**:
```json
{
  "name": "John Doe Updated",
  "avatarUrl": "/avatars/user123.png",
  "background": "Updated background",
  "goals": ["New goal 1", "New goal 2"],
  "strengths": ["Strength 1"],
  "gaps": ["Gap 1"],
  "timePerDayMins": 60,
  "preferredStyle": "theory-first",
  "skillLevel": "Advanced",
  "learningType": "Kinesthetic",
  "major": "Data Science",
  "currentCourses": ["Course 1", "Course 2"],
  // ... other profile fields
}
```
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "profile": { ... }  // Updated profile
  }
}
```

#### PATCH `/v1/profile/preferences`
**Purpose**: Update only user preferences (model, theme, etc.)
**Request**: Requires authentication
**Request Body**:
```json
{
  "defaultModel": "llama-3.1-70b",
  "explanationLength": "detailed",
  "theme": "dark",
  "fontSize": 18,
  "notifications": false
}
```
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "preferences": { ... }  // Updated preferences
  }
}
```

#### POST `/v1/profile/avatar`
**Purpose**: Upload avatar image
**Request**: Requires authentication, multipart/form-data
**Request Body**: Form data with `avatar` file field
**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "avatarUrl": "/uploads/avatars/user123_avatar.png"
  }
}
```
**Note**: For development, use local file storage. Store file path in database. When deploying to cloud, migrate to cloud storage (S3, Cloudinary, etc.) and update avatar URLs.

---

## 5. Middleware Requirements

### 5.1 Authentication Middleware
**File**: `backend/middleware/auth.js`
**Purpose**: Verify JWT token and attach user to request
**Function**: `authenticateToken(req, res, next)`
**Behavior**:
- Extract token from `Authorization: Bearer <token>` header
- Verify JWT signature and expiration
- Attach `req.user = { id, email, name }` to request
- Call `next()` if valid, return 401 if invalid

### 5.2 Optional Authentication Middleware
**File**: `backend/middleware/auth.js`
**Purpose**: Verify token if present, but don't require it
**Function**: `optionalAuth(req, res, next)`
**Behavior**:
- If token present and valid, attach user
- If no token or invalid, continue without user (for demo/anonymous sessions)
- Always call `next()`

### 5.3 Protected Route Wrapper
**Usage**: Apply to routes that require authentication
```javascript
router.get('/profile', authenticateToken, getProfile);
```

---

## 6. Frontend Requirements

### 6.1 Authentication State Management
**File**: `frontend/my-app/src/state/authStore.js`
**Purpose**: Manage authentication state using Zustand
**State**:
```javascript
{
  user: {
    id: string | null,
    email: string | null,
    name: string | null,
    avatarUrl: string | null
  } | null,
  accessToken: string | null,
  isAuthenticated: boolean,
  isLoading: boolean,
  error: string | null
}
```
**Actions**:
- `login(email, password)` - Call login API, store tokens, update state
- `signup(email, password, name)` - Call signup API, store tokens, update state
- `logout()` - Clear tokens, reset state, call logout API
- `refreshToken()` - Call refresh endpoint, update access token
- `loadUser()` - Call `/auth/me` to load user data on app init
- `updateUser(userData)` - Update local user state

**Persistence**: Store accessToken in localStorage
**Refresh Token**: Store in httpOnly cookie (set by backend)

### 6.2 API Client Updates
**File**: `frontend/my-app/src/lib/authApi.js` (new)
**Functions**:
- `signup(email, password, name)`
- `login(email, password)`
- `logout()`
- `refreshToken()`
- `getCurrentUser()`
- `updateProfile(profileData)`
- `updatePreferences(preferences)`
- `uploadAvatar(file)`

**File**: `frontend/my-app/src/lib/sessionApi.js` (update)
**Changes**:
- Add `Authorization: Bearer ${token}` header to all requests
- Handle 401 responses (token expired) - attempt refresh, redirect to login if fails

### 6.3 Protected Routes
**File**: `frontend/my-app/src/components/ProtectedRoute.jsx` (new)
**Purpose**: Wrapper component to protect routes
**Behavior**:
- Check if user is authenticated
- If not authenticated, redirect to `/signin` with return URL
- If authenticated, render children

**Usage**:
```jsx
<Route path="/chat" element={
  <ProtectedRoute>
    <ChatInterface />
  </ProtectedRoute>
} />
```

### 6.4 SignIn Page Updates
**File**: `frontend/my-app/src/Pages/SignIn.jsx`
**Changes**:
- Connect form to `authStore.login()`
- Show loading state during login
- Display error messages from API
- Redirect to intended page after successful login
- Add "Forgot Password" link functionality

### 6.5 SignUp Page Updates
**File**: `frontend/my-app/src/Pages/SignUp.jsx`
**Changes**:
- Connect form to `authStore.signup()`
- Add First Name and Last Name fields (match Figma design)
- Add password confirmation field with validation
- Add password requirements hint: "≥8 chars, 1 letter, 1 number"
- Add Research Consent checkbox
- Show loading state during signup
- Display error messages from API
- On successful signup, redirect to onboarding flow (`/onboarding/step-1`)
- Match Figma design: modal overlay, centered form, logo at top

### 6.6 Onboarding Flow (New Pages)
**Files**: 
- `frontend/my-app/src/Pages/Onboarding/Step1ProfileBasics.jsx` (new)
- `frontend/my-app/src/Pages/Onboarding/Step2CourseGoal.jsx` (new)
- `frontend/my-app/src/Pages/Onboarding/Step3BackgroundIntent.jsx` (new)
- `frontend/my-app/src/Pages/Onboarding/Step4Preferences.jsx` (new)

**Features**:
- Multi-step wizard with progress indicator (Steps X/4, percentage)
- Each step saves data to backend via POST endpoints
- "Skip" button available on each step (saves with defaults)
- "Next" button advances to next step
- Final step has "Finish" button
- On completion, redirect to `/chat`
- Match Figma designs for each step

### 6.7 Profile Page Updates
**File**: `frontend/my-app/src/Pages/Profile.jsx`
**Changes**:
- Load user profile from API on mount (`GET /v1/profile`)
- Connect form fields to profile data
- Implement save functionality (`PUT /v1/profile`)
- Add avatar selection UI (14+ avatars in grid, match Figma)
- Avatar selection opens modal/popup with all avatar options
- Show selected avatar with chevron icon
- Skill Level, Learning Type, Major dropdowns
- Course & Goal section with "Add Course" button
- Weekly Goal inputs (Days per week, Minutes per session)
- Show loading and error states
- Match Figma design layout and styling

### 6.8 Chat History Page Updates
**File**: `frontend/my-app/src/Pages/ChatHistory.jsx`
**Changes**:
- Load user's sessions on mount (`GET /v1/sessions`)
- Display list of sessions with topic, title, progress, status
- Show "Resume" button for incomplete sessions
- Show "View" button for completed sessions (read-only)
- Clicking resume loads session state and navigates to `/chat` with sessionId
- Filter sessions by status (all, in_progress, completed)

### 6.9 Settings Page Updates
**File**: `frontend/my-app/src/Pages/Settings.jsx`
**Changes**:
- Load user preferences from API
- Connect preference toggles to API (`PATCH /v1/profile/preferences`)
- Implement password change functionality
- Implement account deletion (with confirmation)
- Show loading and error states

### 6.10 Session Store Integration
**File**: `frontend/my-app/src/state/sessionStore.js`
**Changes**:
- When creating session, use authenticated user's profile instead of dummy
- Link session to `userId` from auth store
- Load user profile on app initialization
- Update profile source from `'dummy'` to `'user'` when authenticated

### 6.11 App Initialization
**File**: `frontend/my-app/src/App.jsx` or `index.js`
**Changes**:
- On app load, check for stored access token
- If token exists, call `authStore.loadUser()` to verify and load user
- If token invalid/expired, attempt refresh
- If refresh fails, clear auth state and redirect to login

---

## 7. Security Requirements

### 7.1 Password Security
- **Hashing**: Use bcrypt with 10-12 salt rounds
- **Validation**: Minimum 8 characters, require at least one letter and one number
- **Storage**: Never store plaintext passwords
- **Reset**: Secure token generation, expiration (1 hour), single-use tokens

### 7.2 JWT Security
- **Secret**: Use strong secret from environment variable (`JWT_SECRET`)
- **Access Token Expiry**: 15-30 minutes
- **Refresh Token Expiry**: 7-30 days
- **Token Storage**: 
  - Access token: localStorage
  - Refresh token: httpOnly cookie (more secure)
- **Token Rotation**: Consider rotating refresh tokens on use

### 7.3 Rate Limiting
- **Login Endpoints**: Stricter rate limits (5 attempts per 15 minutes per IP)
- **Signup Endpoints**: Moderate limits (3 per hour per IP)
- **Password Reset**: Limit to prevent abuse (3 per hour per email)

### 7.4 Input Validation
- **Email**: Validate format, sanitize input
- **Password**: Enforce strength requirements
- **Profile Data**: Validate all fields, sanitize strings, validate arrays/enums

### 7.5 CORS & Headers
- **CORS**: Configure for frontend origin only
- **Headers**: Set appropriate security headers (already using Helmet)
- **Cookies**: Set `SameSite` and `Secure` flags for refresh token cookies

### 7.6 SQL Injection / NoSQL Injection
- **Mongoose**: Use parameterized queries (Mongoose handles this)
- **Validation**: Use Zod schemas for all inputs

---

## 8. Migration Strategy

### 8.1 Session History & Continuation
**Requirement**: Users must be able to access their previous chats and continue incomplete study sessions after login
**Solution**:
- All sessions created after authentication will have `userId` set
- When user logs in, they can view all their sessions via `/v1/sessions` endpoint
- Incomplete sessions (phase !== 'completed') can be resumed
- Completed sessions can be viewed in read-only mode
- Chat History page will show user's sessions filtered by `userId`
- When resuming a session, load full session state including messages, progress, and plan

**Implementation**:
- `GET /v1/sessions` - List all sessions for authenticated user (filtered by userId)
- `GET /v1/sessions/:id` - Get specific session (verify userId matches)
- Session routes must verify `userId` matches authenticated user
- Frontend Chat History page loads user's sessions on mount
- Resume functionality loads session state into sessionStore

### 8.2 Profile Data
**Solution**:
- On signup, create User with default profile (from onboarding flow)
- User completes onboarding flow after signup to populate profile
- Profile data stored in User model, not passed in request body
- When creating new session, use user's profile from User model
- Assessment endpoint always uses user profile from database (no request body fallback)

### 8.3 Remove Dummy Profile Support
- Remove all dummy profile logic from codebase
- Remove `source: 'dummy'` from Session model profile
- Assessment endpoint requires authenticated user (no anonymous sessions)
- All sessions require `userId` (make it required in Session model)

---

## 9. Testing Requirements

### 9.1 Backend Tests
**File**: `backend/tests/authRoutes.test.js` (new)
**Test Cases**:
- Signup with valid data
- Signup with duplicate email (should fail)
- Signup with invalid email format
- Signup with weak password
- Login with valid credentials
- Login with invalid email
- Login with invalid password
- Login rate limiting
- Token refresh
- Token refresh with invalid token
- Get current user (authenticated)
- Get current user (unauthenticated)
- Logout
- Password reset flow
- Profile retrieval
- Profile update
- Profile update validation

**File**: `backend/tests/profileRoutes.test.js` (new)
**Test Cases**:
- Get profile (authenticated)
- Get profile (unauthenticated - should fail)
- Update profile with valid data
- Update profile with invalid data
- Update preferences
- Upload avatar
- Avatar file validation

### 9.2 Frontend Tests
**File**: `frontend/my-app/src/state/authStore.test.js` (new)
**Test Cases**:
- Login success flow
- Login error handling
- Signup success flow
- Signup error handling
- Logout
- Token refresh
- User state persistence

**File**: `frontend/my-app/src/components/ProtectedRoute.test.jsx` (new)
**Test Cases**:
- Renders children when authenticated
- Redirects when not authenticated
- Preserves return URL

### 9.3 Integration Tests
- Full signup → login → create session → use profile flow
- Profile update → session creation uses new profile
- Token expiration → refresh → continue session

---

## 10. Dependencies to Add

### 10.1 Backend
```json
{
  "jsonwebtoken": "^9.0.0",
  "bcrypt": "^5.1.0",
  "cookie-parser": "^1.4.6",
  "multer": "^1.4.5-lts.1"
}
```
**Note**: For development, use local file storage with multer. When deploying, add cloud storage SDK (e.g., `@aws-sdk/client-s3` for S3 or `cloudinary` for Cloudinary) and migrate upload logic.

### 10.2 Frontend
No new dependencies needed (can use existing fetch API)

---

## 11. Environment Variables

### 11.1 Backend (.env)
```bash
# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_ACCESS_EXPIRY=30m
JWT_REFRESH_EXPIRY=7d

# Password Reset
PASSWORD_RESET_EXPIRY=1h
EMAIL_SERVICE_ENABLED=false  # For MVP, password reset emails disabled

# CORS
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# Avatar Upload (local storage for dev, cloud storage for production)
AVATAR_UPLOAD_DIR=./uploads/avatars  # Local directory for development
MAX_AVATAR_SIZE=5242880  # 5MB
# Cloud storage config (for future deployment)
# CLOUD_STORAGE_PROVIDER=cloudinary  # or 's3', 'cloudinary', etc.
# CLOUD_STORAGE_BUCKET=your-bucket-name
# CLOUD_STORAGE_REGION=us-east-1
# CLOUD_STORAGE_ACCESS_KEY=your-access-key
# CLOUD_STORAGE_SECRET_KEY=your-secret-key
```

---

## 12. File Structure

### 12.1 New Backend Files
```
backend/
  models/
    User.js                    # User model with profile
  routes/
    authRoutes.js              # Authentication endpoints
    profileRoutes.js           # Profile management endpoints
  middleware/
    auth.js                    # JWT authentication middleware
  validation/
    authValidation.js          # Auth input validation schemas
    profileValidation.js       # Profile input validation schemas
  utils/
    jwt.js                     # JWT token generation/verification helpers
    password.js                # Password hashing/validation helpers
    fileUpload.js              # File upload helpers (local storage, ready for cloud migration)
  tests/
    authRoutes.test.js         # Auth endpoint tests
    profileRoutes.test.js      # Profile endpoint tests
```

### 12.2 Updated Backend Files
```
backend/
  app.js                       # Add auth routes, auth middleware
  routes/
    sessionRoutes.js           # Update to use authenticated user, add GET /v1/sessions
    assessmentRoutes.js        # Update to use user profile from DB, require auth
  models/
    Session.js                 # Make userId required, remove dummy profile support
```

### 12.3 New Frontend Files
```
frontend/my-app/src/
  state/
    authStore.js               # Authentication state management
  lib/
    authApi.js                 # Auth API client functions
  components/
    ProtectedRoute.jsx         # Route protection component
  Pages/
    Onboarding/
      Step1ProfileBasics.jsx  # Onboarding step 1
      Step2CourseGoal.jsx     # Onboarding step 2
      Step3BackgroundIntent.jsx # Onboarding step 3
      Step4Preferences.jsx    # Onboarding step 4
```

### 12.4 Updated Frontend Files
```
frontend/my-app/src/
  Pages/
    SignIn.jsx                 # Connect to auth API
    SignUp.jsx                 # Connect to auth API, redirect to onboarding
    Profile.jsx                # Connect to profile API, match Figma design
    Settings.jsx               # Connect to preferences API
    ChatHistory.jsx            # Load user sessions, resume functionality
  state/
    sessionStore.js            # Integrate with auth store, remove dummy profile
  lib/
    sessionApi.js              # Add auth headers, add getSessions()
    assessmentApi.js           # Add auth headers
    chatApi.js                 # Add auth headers
    quizApi.js                 # Add auth headers
  App.jsx                     # Add protected routes, auth initialization
```

---

## 13. Implementation Phases

### Phase 1: Backend Foundation (Core Auth)
1. Create User model
2. Implement JWT utilities
3. Create auth middleware
4. Implement signup/login endpoints
5. Add password hashing/validation
6. Write basic tests

### Phase 2: Profile & Onboarding Backend
1. Add profile schema to User model
2. Create profile routes (GET/PUT)
3. Create preferences routes (PATCH)
4. Create onboarding routes (4 step endpoints)
5. Add validation schemas
6. Write tests

### Phase 3: Frontend Auth
1. Create authStore
2. Create authApi
3. Update SignIn/SignUp pages (match Figma designs)
4. Create ProtectedRoute component
5. Add auth initialization to App
6. Update API clients to include auth headers
7. Create onboarding flow pages (4 steps)

### Phase 4: Frontend Profile & Session History
1. Update Profile page to load/save data (match Figma design)
2. Update Settings page for preferences
3. Update Chat History page to load user sessions
4. Implement session resume functionality
5. Integrate authStore with sessionStore
6. Update session creation to use user profile
7. Remove dummy profile support from sessionStore

### Phase 5: Integration & Polish
1. End-to-end testing
2. Error handling improvements
3. Loading states
4. Token refresh flow
5. Password reset flow (if email service available)

---

## 14. Acceptance Criteria

### 14.1 Authentication
- [ ] User can sign up with email/password/name
- [ ] User can login with email/password
- [ ] User receives JWT tokens on successful auth
- [ ] Protected routes require valid token
- [ ] Invalid/expired tokens return 401
- [ ] Token refresh works seamlessly
- [ ] User can logout (tokens invalidated)
- [ ] Rate limiting prevents brute force attacks

### 14.2 Profile Management
- [ ] User profile loads on Profile page
- [ ] User can update all profile fields
- [ ] Profile changes persist to database
- [ ] Avatar upload works (local file storage for development)
- [ ] Preferences update independently
- [ ] Profile data is used in session creation
- [ ] Assessment uses user profile from DB

### 14.3 Integration
- [ ] New sessions are linked to authenticated user
- [ ] Session history shows user's sessions (filtered by userId)
- [ ] Users can resume incomplete sessions from Chat History
- [ ] Completed sessions open in read-only mode
- [ ] Profile data flows into assessment logic
- [ ] Settings preferences affect app behavior
- [ ] Protected routes redirect to login when needed
- [ ] No dummy profile support - all sessions require authentication

### 14.4 Security
- [ ] Passwords are hashed with bcrypt
- [ ] JWT tokens are signed and verified
- [ ] Refresh tokens stored in httpOnly cookies
- [ ] Input validation on all endpoints
- [ ] Rate limiting on auth endpoints
- [ ] CORS configured correctly

---

## 15. Open Questions / Decisions Needed

1. **Email Verification**: Should we implement email verification for signup? (MVP: No, Phase 2: Yes)
2. **Password Reset**: Should we implement email-based password reset? (MVP: Token generation only, email service later)
3. **Avatar Storage**: ✅ **DECIDED** - Use local file storage for development, migrate to cloud storage (S3/Cloudinary) when deploying
4. **Anonymous Sessions**: ✅ **DECIDED** - No anonymous sessions. All sessions require authentication
5. **Token Storage**: ✅ **DECIDED** - Access token in localStorage
6. **Session Linking**: ✅ **DECIDED** - Users can access and continue all their previous sessions after login

---

## 16. Success Metrics

- Users can create accounts and login successfully
- Profile data persists and is used in learning sessions
- Protected routes are properly secured
- Token refresh works without user intervention
- All existing functionality works with authenticated users
- Zero security vulnerabilities in authentication flow

---

## 16. UI Design Reference (Figma)

The following Figma designs provide UI specifications for auth and profile flows:

1. **Login Page**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=33787-2392&m=dev)
2. **Sign Up Page**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=33845-463&m=dev)
3. **Profile Page**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=33800-654&m=dev)
4. **Profile Page (Avatar Selection)**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=33800-800&m=dev)
5. **Profile Page (Course & Goal)**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=33800-1114&m=dev)
6. **Onboarding - Profile Basics**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=33845-992&m=dev)
7. **Onboarding - Course & Goal**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=33893-530&m=dev)
8. **Onboarding - Background & Intent**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=34136-573&m=dev)
9. **Onboarding - Preferences**: [Figma Link](https://www.figma.com/design/TLhQNICNP6sgbtnUU69BoA/Study-Assist--Copy-?node-id=34136-808&m=dev)

**Key UI Elements from Designs**:
- Avatar selection with 14+ avatar options
- Multi-step onboarding flow (4 steps) with progress indicator
- Profile form with Skill Level, Learning Type, Major dropdowns
- Course & Goal section with "Add Course" functionality
- Weekly Goal inputs (Days per week, Minutes per session)
- Preferences: Default Mode (Studying/Revision), Explanation Length, Examples Preference, Code Language

---

## Document Status

**Version**: 1.1  
**Last Updated**: [Current Date]  
**Status**: ✅ Approved - Ready for Implementation  
**Key Decisions Made**:
- ✅ Cloud storage for avatars (MVP requirement)
- ✅ localStorage for access tokens
- ✅ Session history and resume functionality required
- ✅ Remove dummy profile support - all sessions require auth
**Next Step**: Begin Phase 1 implementation


