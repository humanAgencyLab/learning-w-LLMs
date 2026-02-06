# Figure 1: System Overview

## Mermaid Diagram Code (for rendering) - Compact Version

```mermaid
flowchart TB
    Start(["User Enters Topic"]) --> Intent["Intent Assessment<br/>LLM Analyzes Learning Intent"]
    Intent --> Planning["Personalized Planning<br/>LLM Generates 2-3 Modules<br/>User Reviews & Approves"]
    Planning --> Learning["Milestone-Based Learning"]
    
    Learning --> Milestone["Milestone: Teaching + Assessment Question"]
    Milestone --> Answer{Student Answer}
    Answer -- Correct --> NextMilestone{More Milestones?}
    Answer -- Incorrect --> Retry["Re-teach + Retry"]
    Retry --> Answer
    NextMilestone -- Yes --> Milestone
    NextMilestone -- No --> Quiz["Module Quiz<br/>5 Questions, ≥60% to Pass"]
    
    Quiz --> QuizResult{Quiz Result}
    QuizResult -- Pass --> Feedback["Feedback Phase<br/>Show Results & Progress"]
    QuizResult -- Fail --> Review["Identify Milestones<br/>for Review"]
    Review --> Learning
    
    Feedback --> NextModule{More Modules?}
    NextModule -- Yes --> Learning
    NextModule -- No --> Completed["Completed Phase<br/>Certificate Generated"]
    
    style Start fill:#e1f5ff
    style Intent fill:#fff4e1
    style Planning fill:#fff4e1
    style Learning fill:#e8f5e9
    style Milestone fill:#fff9c4
    style Quiz fill:#f3e5f5
    style Feedback fill:#f3e5f5
    style Completed fill:#e8f5e9
```

## Alternative: Detailed System Architecture Diagram

```mermaid
graph LR
    subgraph "User Interface"
        UI[Chat Interface<br/>React Frontend]
    end
    
    subgraph "Learning Flow"
        A[Intent Assessment] --> B[Plan Generation]
        B --> C[Milestone Learning]
        C --> D[Module Quiz]
        D --> E[Feedback]
        E -->|Next Module| C
        E -->|All Complete| F[Certificate]
    end
    
    subgraph "LLM Agents"
        IA[Intent Analyzer]
        PG[Plan Generator]
        CM[Conversation Manager]
        TA[Teacher Agent]
        AA[Assessment Analyzer]
        QG[Quiz Generator]
    end
    
    subgraph "State Management"
        SM[Session State<br/>Phase, Milestones, Progress]
    end
    
    UI --> A
    A --> IA
    IA --> B
    B --> PG
    PG --> C
    C --> CM
    CM --> TA
    TA --> AA
    AA --> C
    C --> D
    D --> QG
    D --> E
    E --> CM
    
    CM --> SM
    SM --> UI
    
    style UI fill:#e3f2fd
    style A fill:#fff3e0
    style B fill:#fff3e0
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#f3e5f5
    style F fill:#e8f5e9
    style IA fill:#fff9c4
    style PG fill:#fff9c4
    style CM fill:#fff9c4
    style TA fill:#fff9c4
    style AA fill:#fff9c4
    style QG fill:#fff9c4
```

## Figure 1 Description for Paper

**Figure 1: System Overview.** The diagram illustrates the key components and workflow of the Learning with LLMs platform. The system follows a structured learning flow: (1) **Intent Assessment**, where the LLM analyzes the user's learning intent; (2) **Personalized Planning**, where a 2-3 module learning plan is generated and approved; (3) **Milestone-Based Learning**, where students progress through sequential milestones (3-6 per module) by correctly answering assessment questions—each milestone follows the pattern of teaching content, assessment question, and retry mechanism for incorrect answers; (4) **Module Quiz**, a 5-question assessment requiring ≥60% to pass; (5) **Feedback**, showing results and progress; and (6) **Completion**, where certificates are generated after all modules are completed. The system loops back to milestone learning for subsequent modules until all are completed. Failed quizzes trigger review of specific milestones before retaking the quiz.
