# Figure 2: Multi-Prompt LLM Architecture - Clean Version

## Recommended: Simple & Clean Diagram

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

## Even Simpler: Minimal Version

```mermaid
flowchart LR
    UI[User] --> API[API]
    API --> PM[Prompt Modules]
    PM --> LLM[Groq API<br/>Llama 3.3 70B]
    PM --> DB[(MongoDB)]
    DB --> API
    LLM --> PM
    PM --> API
    API --> UI
    
    subgraph PM[" "]
        direction TB
        P1[Intent]
        P2[Plan]
        P3[Conversation]
        P4[Teacher]
        P5[Assessment]
        P6[Quiz]
    end
    
    style UI fill:#e3f2fd
    style API fill:#fff3e0
    style LLM fill:#f3e5f5,stroke:#9c27b0,stroke-width:3px
    style P1 fill:#fff9c4
    style P2 fill:#fff9c4
    style P3 fill:#fff9c4
    style P4 fill:#fff9c4
    style P5 fill:#fff9c4
    style P6 fill:#fff9c4
    style DB fill:#e8f5e9
```

## Alternative: Layered Architecture (Cleanest)

```mermaid
flowchart TB
    subgraph Layer1["Presentation Layer"]
        UI[User Interface]
    end
    
    subgraph Layer2["API Layer"]
        API[Express.js Routes]
    end
    
    subgraph Layer3["Prompt Modules Layer"]
        direction LR
        P1[Intent] 
        P2[Plan]
        P3[Conversation]
        P4[Teacher]
        P5[Assessment]
        P6[Quiz]
    end
    
    subgraph Layer4["LLM Layer"]
        LLM[Groq API<br/>Llama 3.3 70B]
    end
    
    subgraph Layer5["Data Layer"]
        DB[(MongoDB)]
    end
    
    UI --> API
    API --> Layer3
    Layer3 --> LLM
    Layer3 --> DB
    LLM --> Layer3
    DB --> API
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
    style DB fill:#e8f5e9
```

## Figure 2 Caption

**Figure 2: Multi-Prompt LLM Architecture.** The system uses a single LLM instance (Groq API with Llama 3.3 70B) with specialized prompt modules that orchestrate different aspects of the learning flow. Each prompt module (Intent Analyzer, Plan Generator, Conversation Manager, Teacher Prompt, Assessment Analyzer, Quiz Generator) builds context-specific prompts for the same LLM, enabling specialized outputs for different tasks. All prompt modules share the same LLM instance and maintain context coherence through structured state management in the Session model (MongoDB).
