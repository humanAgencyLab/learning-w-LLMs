# Figure 1: System Overview - Compact Version

## Mermaid Diagram Code (Ready to Use)

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

## Key Improvements

1. **Single Milestone Pattern**: Instead of showing M1, M2, M3 explicitly, shows one "Milestone" box with a loop
2. **"More Milestones?" Decision**: Shows the pattern repeats until all milestones in module are complete
3. **More Compact**: Reduces visual complexity while maintaining clarity
4. **Clear Loop Structure**: Shows how milestone learning repeats within a module

## Figure Caption

**Figure 1: System Overview.** The diagram illustrates the key components and workflow of the Learning with LLMs platform. The system follows a structured learning flow: (1) **Intent Assessment**, where the LLM analyzes the user's learning intent; (2) **Personalized Planning**, where a 2-3 module learning plan is generated and approved; (3) **Milestone-Based Learning**, where students progress through sequential milestones (3-6 per module) by correctly answering assessment questions—each milestone follows the pattern of teaching content, assessment question, and retry mechanism for incorrect answers; (4) **Module Quiz**, a 5-question assessment requiring ≥60% to pass; (5) **Feedback**, showing results and progress; and (6) **Completion**, where certificates are generated after all modules are completed. The system loops back to milestone learning for subsequent modules until all are completed. Failed quizzes trigger review of specific milestones before retaking the quiz.

## How to Use

1. Copy the Mermaid code above
2. Paste into https://mermaid.live to preview
3. Export as PNG/SVG for your paper
4. Or use the code in your markdown/documentation

## Alternative: Even More Compact (if needed)

If you need it even more compact, you could combine some phases:

```mermaid
flowchart LR
    A[Intent] --> B[Planning]
    B --> C[Learning Loop]
    C --> D[Milestone: Teach + Question]
    D --> E{Correct?}
    E -->|No| F[Retry]
    F --> E
    E -->|Yes| G{More Milestones?}
    G -->|Yes| D
    G -->|No| H[Quiz]
    H --> I{Pass?}
    I -->|No| C
    I -->|Yes| J{More Modules?}
    J -->|Yes| C
    J -->|No| K[Certificate]
    
    style A fill:#fff4e1
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#fff9c4
    style H fill:#f3e5f5
    style K fill:#c8e6c9
```
