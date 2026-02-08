# Study Assist - LLM-Powered Learning Platform

An intelligent, chat-based learning platform that helps users study and revise topics dynamically using LLM technology. Uses Self-Regulated Learning (SRL) principles with milestone-based progression. Features personalized learning plans, interactive teaching, quizzes, certificates, and progress tracking.

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18 or higher)
- **MongoDB** (local installation or MongoDB Atlas)
- **API Keys**: Groq API key (or OpenAI API key)
- **Git** (for cloning the repository)

### Setup

#### 1. Clone the Repository
```bash
git clone <repository-url>
cd learning-w-LLMs
```

#### 2. Backend Setup
```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your actual API keys and MongoDB URI

# Start the backend server
npm start
```

#### 3. Frontend Setup
```bash
# Navigate to frontend (in a new terminal)
cd frontend/my-app

# Install dependencies
npm install

# Set up environment variables (optional - uses proxy by default)
cp .env.example .env
# Edit .env if you need custom API configuration

# Start the frontend development server
npm start
```

### Running the Application

You'll need **two terminals** running simultaneously:

**Terminal 1 - Backend:**
```bash
cd backend
npm start
# Server runs on http://localhost:5001
```

**Terminal 2 - Frontend:**
```bash
cd frontend/my-app
npm start
# App runs on http://localhost:3000
```

### Environment Configuration

#### Backend Environment Variables
Copy `backend/.env.example` to `backend/.env` and configure:

```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/studyassist
CORS_ORIGINS=http://localhost:3000
LLM_PROVIDER=groq
LLM_MODEL=llama3.1
GROQ_API_KEY=your_groq_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

#### Frontend Environment Variables
Copy `frontend/my-app/.env.example` to `frontend/my-app/.env` (optional):

```env
# Leave empty to use CRA proxy (recommended for local development)
REACT_APP_API_BASE_URL=
```

### Development URLs

- **Frontend**: http://localhost:3000 (redirects to `/signin` if logged out, `/chat` if logged in)
- **Backend API**: http://localhost:5001
- **Health Check**: http://localhost:5001/v1/health
- **UI Demo**: http://localhost:3000/ui-demo

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18, Zustand (state management), Tailwind CSS
- **Backend**: Node.js, Express, MongoDB (Mongoose)
- **LLM Provider**: Groq (Llama) → Future: Local models
- **Security**: Helmet, Rate limiting, CORS

### Project Structure
```
learning-w-LLMs/
├── frontend/my-app/          # React frontend
│   ├── src/
│   │   ├── components/ui/    # Design system components
│   │   ├── state/           # Zustand store
│   │   ├── design/          # Design tokens
│   │   └── Pages/           # Main pages
├── backend/                  # Express backend
│   ├── models/              # MongoDB schemas
│   ├── routes/              # API routes
│   ├── middleware/          # Security & optimization
│   └── prompts/             # LLM prompts
└── docs/                    # Documentation
```

## 🎯 Core Features

### Learning Flow
1. **Learning Intent**: User enters a topic name in the chat
2. **Planning**: LLM generates a personalized learning plan (2-8 modules, 3-6 milestones each)
3. **Plan Approval/Modification**: User reviews, modifies (optional), and approves the plan
4. **Learning**: Interactive milestone-based teaching with assessment questions (150-250 words per teaching)
5. **Quizzing**: Auto-generated MCQ quiz (5 questions per module, ≥70% to pass)
6. **Feedback**: Quiz results shown, user can retry or proceed to next module
7. **Completed**: All modules completed, certificate generated, session locked as view-only

### Gamification & Progress
- **Points**: 100 per topic, distributed across modules based on milestone completion
- **Gems**: 1 gem per 20 points earned (calculated from total points across all sessions)
- **Certificates**: PDF certificates generated upon topic completion
- **Progress Tracking**: Real-time progress bars, milestone checkmarks, module status

### Design System
- **Design Tokens**: Centralized colors, spacing, typography
- **Component Library**: 12+ reusable UI components
- **Responsive Design**: Mobile-first approach
- **Accessibility**: ARIA attributes and keyboard navigation

## 🔧 Development

### Available Scripts

#### Frontend
```bash
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
npm run lint       # Run ESLint
npm run lint:fix   # Fix ESLint issues
npm run format     # Format code with Prettier
```

#### Backend
```bash
npm start          # Start production server
npm run dev        # Start development server (if available)
npm run lint       # Run ESLint
```

### Code Quality
- **ESLint**: Configured with React support and sensible rules
- **Prettier**: Consistent code formatting
- **Type Safety**: Well-defined interfaces and validation
- **Testing**: Jest + React Testing Library

## 🚨 Known Issues

### React 18 + Create React App
- **Issue**: Some deprecation warnings with React 18 and CRA
- **Status**: Non-blocking warnings, app functions correctly
- **Workaround**: Warnings are cosmetic and don't affect functionality
- **Future**: Consider migrating to Vite in Phase 8

### Port Conflicts
- **Issue**: "Something is already running on port 3000/5001"
- **Solution**: Kill existing processes or use different ports
- **Commands**:
  ```bash
  # Kill process on port 3000
  lsof -ti:3000 | xargs kill -9
  
  # Kill process on port 5001
  lsof -ti:5001 | xargs kill -9
  ```

### MongoDB Connection
- **Issue**: "MongoDB connection failed"
- **Solution**: Ensure MongoDB is running locally or update MONGODB_URI in .env

## 📚 Documentation

- **[Production Readiness Roadmap](docs/Production_Readiness_Roadmap.md)**: Complete phase-by-phase development plan
- **[Backend README](backend/README.md)**: Backend-specific setup and API documentation
- **[Frontend README](frontend/my-app/README.md)**: Frontend-specific setup and component documentation

## 🛠️ Troubleshooting

### Common Issues

1. **"Module not found" errors**
   - Run `npm install` in both frontend and backend directories
   - Check that you're in the correct directory

2. **API calls failing**
   - Ensure backend is running on port 5001
   - Check CORS_ORIGINS in backend/.env includes http://localhost:3000
   - Verify API keys are set correctly

3. **MongoDB connection issues**
   - Ensure MongoDB is running locally
   - Check MONGODB_URI in backend/.env
   - For MongoDB Atlas, ensure IP whitelist includes your IP

4. **Build failures**
   - Clear node_modules and package-lock.json, then reinstall
   - Check Node.js version (v18+ required)
   - Ensure all environment variables are set

### Getting Help

1. Check the [Production Readiness Roadmap](docs/Production_Readiness_Roadmap.md) for current phase status
2. Review the [Backend README](backend/README.md) for API-specific issues
3. Check the terminal output for specific error messages
4. Ensure all prerequisites are installed and configured

## 🚀 Current Status

The application is **production-ready** with the following features implemented:

- ✅ **User Authentication**: Sign up, sign in, logout, password reset, JWT tokens
- ✅ **User Onboarding**: Multi-step onboarding with profile collection
- ✅ **Learning Plans**: Dynamic 2-8 module plans with milestone-based progression
- ✅ **Interactive Teaching**: LLM-powered milestone teaching with assessment questions
- ✅ **Quiz System**: Auto-generated MCQ quizzes with explanations
- ✅ **Revision Mode**: Quiz-only mode for reviewing completed topics
- ✅ **Certificate Generation**: PDF certificates upon topic completion
- ✅ **Session Management**: Chat history, favorites, search, filters
- ✅ **Progress Tracking**: Points, gems, modules completed, topics completed
- ✅ **Deployment**: Google Cloud Run (backend) + Firebase Hosting (frontend)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

For detailed documentation, see:
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)**: Quick reference guide
- **[ONBOARDING_GUIDE.md](ONBOARDING_GUIDE.md)**: Complete onboarding guide
- **[docs/TEACHING_SYSTEM_DOCUMENTATION.md](docs/TEACHING_SYSTEM_DOCUMENTATION.md)**: Teaching system documentation

---
*Last updated: Feb 2026*