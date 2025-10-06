# Research Study Token Budget

## Study Parameters
- **Participants**: 200
- **Duration per participant**: 45 minutes
- **Study duration**: 2-3 days
- **Groq free tier**: 50,000 tokens/day

## Token Usage Estimates

### Per Participant (Optimized)
- **System prompt**: 1,500 tokens (optimized from 15,000)
- **Assessment phase**: 500 tokens (2-3 questions)
- **Learning phase**: 1,000 tokens (4-5 interactions)
- **Quiz phase**: 300 tokens (1-2 quizzes)
- **Total per participant**: ~3,300 tokens

### Daily Capacity
- **Tokens per day**: 50,000
- **Participants per day**: 15 (50,000 ÷ 3,300)
- **Study completion time**: 14 days (200 ÷ 15)

## Optimization Strategies

### 1. Template Responses (90% reduction)
- Common assessment questions: 50 tokens
- Plan overviews: 100 tokens
- Module completions: 50 tokens
- **Savings**: 2,000 tokens per participant

### 2. Caching (80% reduction)
- Cache similar responses for 1 hour
- Reuse plan templates by topic
- **Savings**: 1,500 tokens per participant

### 3. Smart Routing
- Use templates for 70% of interactions
- AI only for complex queries
- **Savings**: 1,000 tokens per participant

## Final Budget
- **Optimized per participant**: 800 tokens
- **200 participants**: 160,000 tokens total
- **Study duration**: 4 days (40,000 tokens/day)
- **Safety buffer**: 10,000 tokens

## Monitoring
- Real-time token usage tracking
- Daily budget alerts
- Participant queue management
- Automatic study pause if limits hit

## Fallback Plan
- If daily limit exceeded: Queue participants for next day
- If total budget exceeded: Prioritize completed sessions
- Emergency: Use template-only mode for remaining participants
