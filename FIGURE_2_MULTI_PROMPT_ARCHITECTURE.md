# Figure 2: Multi-Prompt LLM Architecture

## Accurate Terminology

You're correct! The system uses:
- **Single LLM** (Groq API with Llama 3.3 70B)
- **Specialized Prompt Modules** (different prompt builders for different tasks)
- **Not separate agents** - just different prompts to the same LLM

## Recommended: Clean & Simple Diagram (Use This One)

```mermaid
flowchart TB
    UI[User Interface] --> API[API Routes]
    
    API --> Prompts[Prompt Modules]
    
    subgraph Prompts["Specialized Prompt Modules"]
        direction LR
        P1[Intent<br/>Analyzer]
        P2[Plan<br/>Generator]
        P3[Conversation<br/>Manager]
        P4[Teacher<br/>Prompt]
        P5[Assessment<br/>Analyzer]
        P6[Quiz<br/>Generator]
    end
    
    Prompts <--> LLM[Groq API<br/>Llama 3.3 70B<br/>Single LLM Instance]
    
    Prompts <--> SM[(Session State<br/>MongoDB)]
    
    SM --> API
    API --> UI
    
    style UI fill:#e3f2fd
    style API fill:#fff3e0
    style LLM fill:#f3e5f5,stroke:#9c27b0,stroke-width:3px
    style P1 fill:#fff9c4
    style P2 fill:#fff9c4
    style P3 fill:#fff9c4
    style P4 fill:#fff9c4
    style P5 fill:#fff9c4
    style P6 fill:#fff9c4
    style SM fill:#e8f5e9
```

## Alternative: Simplified Flow Diagram

```mermaid
flowchart LR
    UI[User] --> API[API Layer]
    
    API --> P1[Intent<br/>Analyzer]
    API --> P2[Plan<br/>Generator]
    API --> P3[Conversation<br/>Manager]
    API --> P4[Teacher<br/>Prompt]
    API --> P5[Assessment<br/>Analyzer]
    API --> P6[Quiz<br/>Generator]
    
    P1 & P2 & P3 & P4 & P5 & P6 --> LLM[Groq API<br/>Llama 3.3 70B]
    
    LLM --> P1 & P2 & P3 & P4 & P5 & P6
    
    P1 & P2 & P3 & P4 & P5 & P6 --> SM[(Session<br/>State)]
    
    SM --> API
    API --> UI
    
    style UI fill:#e3f2fd
    style API fill:#fff3e0
    style LLM fill:#f3e5f5,stroke:#9c27b0,stroke-width:3px
    style P1 fill:#fff9c4
    style P2 fill:#fff9c4
    style P3 fill:#fff9c4
    style P4 fill:#fff9c4
    style P5 fill:#fff9c4
    style P6 fill:#fff9c4
    style SM fill:#e8f5e9
```

## Recommended: Clean Architecture Diagram (Use This One)

```mermaid
flowchart TB
    UI[User Interface] --> API[API Routes]
    
    API --> Prompts[Prompt Modules]
    
    subgraph Prompts[" "]
        direction TB
        P1[Intent Analyzer]
        P2[Plan Generator]
        P3[Conversation Manager]
        P4[Teacher Prompt]
        P5[Assessment Analyzer]
        P6[Quiz Generator]
    end
    
    Prompts <--> LLM[Groq API<br/>Llama 3.3 70B<br/>Single LLM Instance]
    
    Prompts <--> SM[(Session State<br/>MongoDB)]
    
    SM --> API
    API --> UI
    
    style UI fill:#e3f2fd
    style API fill:#fff3e0
    style LLM fill:#f3e5f5,stroke:#9c27b0,stroke-width:3px
    style P1 fill:#fff9c4
    style P2 fill:#fff9c4
    style P3 fill:#fff9c4
    style P4 fill:#fff9c4
    style P5 fill:#fff9c4
    style P6 fill:#fff9c4
    style SM fill:#e8f5e9
```

## Figure 2 Caption

**Figure 2: Multi-Prompt LLM Architecture.** The system uses a single LLM instance (Groq API with Llama 3.3 70B) with specialized prompt modules that orchestrate different aspects of the learning flow. Each prompt module (Intent Analyzer, Plan Generator, Conversation Manager, Teacher Prompt, Assessment Analyzer, Quiz Generator, Context Summarizer) builds context-specific prompts for the same LLM, enabling specialized outputs for different tasks. The Conversation Manager orchestrates the learning flow by making decisions about phase transitions and actions, while other modules handle specific tasks like generating teaching content, analyzing student responses, or creating quizzes. All modules share the same LLM instance and maintain context coherence through structured state management in the Session model.

## Updated Terminology for Paper

Instead of "multi-agent system," use:
- **"Multi-prompt LLM architecture"**
- **"Specialized prompt modules"**
- **"LLM-based orchestration system"**
- **"Prompt-based component system"**

## Key Points to Emphasize

1. **Single LLM Instance**: All prompt modules use the same Groq API client
2. **Specialized Prompts**: Each module builds different prompts for different tasks
3. **Orchestration**: Conversation Manager coordinates the flow
4. **Context Sharing**: All modules access the same Session state
5. **Efficiency**: Reusing the same LLM instance is more token-efficient than separate agents
