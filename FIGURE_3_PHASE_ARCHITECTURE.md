# Figure 3: Instructor & student surfaces — Phase 1 / Phase 2 architecture

Architecture overview: UI surfaces, API routes, prompt modules (student loop vs instructor loop), Groq LLM, and MongoDB collections.

```mermaid
%%{init: {
  "flowchart": {
    "defaultRenderer": "elk",
    "htmlLabels": true,
    "padding": 28,
    "nodeSpacing": 55,
    "rankSpacing": 75
  },
  "themeVariables": {
    "fontSize": "18px",
    "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
  }
}}%%
flowchart TB
    subgraph UI["User Surfaces"]
        direction LR
        INST["<b>Instructor UI</b><br/>(Phase 2)"]
        STU["<b>Student UI</b><br/>(Phase 1)"]
    end

    subgraph API["API Routes"]
        direction LR
        IR["instructorRoutes"]
        TR["topicRoutes"]
        ER["enrollmentRoutes"]
        AR["analyticsRoutes"]
        CR["chatRoutes"]
        QR["quizRoutes"]
    end

    subgraph AGENTS["Specialized Prompt Modules"]
        subgraph NEW["<b>New &mdash; Phase 2 (Instructor Loop)</b>"]
            direction LR
            MS["materialSummary"]
            TPG["topicPlanGenerator"]
            TDM["topicDraftModify"]
            IB["instructorBriefing"]
            II["instructorInsights"]
            SS["struggleSummary"]
        end
        subgraph EXISTING["Existing &mdash; Phase 1 (Student Loop)"]
            direction LR
            INT["intent"]
            PLAN["plan"]
            CM["convManager"]
            TEACH["teaching"]
            ASSESS["assessment"]
            QUIZ["quiz"]
        end
    end

    LLM(("Groq API<br/>Llama 3.3 70B"))

    subgraph DB["MongoDB"]
        direction LR
        subgraph NEWDB["<b>New collections</b>"]
            COURSE["Course"]
            CT["CourseTopic<br/>(+ quizPattern)"]
            ENR["Enrollment"]
            ICS["InstructorChatSession"]
        end
        subgraph OLDDB["Existing"]
            SESS["Session"]
            QA["QuizAttempt"]
            USER["User"]
        end
    end

    INST --> IR
    INST --> TR
    INST --> AR
    STU --> ER
    STU --> CR
    STU --> QR
    IR --> NEW
    AR --> SS
    AR --> II
    CR --> EXISTING
    QR --> QUIZ
    NEW --> LLM
    EXISTING --> LLM
    NEW <--> NEWDB
    EXISTING <--> OLDDB

    classDef newNode fill:#D97742,stroke:#9C4F2A,color:#FFFFFF,stroke-width:1.5px
    classDef oldNode fill:#2C5F8D,stroke:#1A3D5C,color:#FFFFFF,stroke-width:1.5px
    classDef llm fill:#4A8B6F,stroke:#2E5C49,color:#FFFFFF,stroke-width:2px
    class INST,IR,TR,AR newNode
    class STU,ER,CR,QR oldNode
    class MS,TPG,TDM,IB,II,SS newNode
    class INT,PLAN,CM,TEACH,ASSESS,QUIZ oldNode
    class COURSE,CT,ENR,ICS newNode
    class SESS,QA,USER oldNode
    class LLM llm
```
