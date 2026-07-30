# Study Plan: Instructor Study (Clean, Verified Version)

**Study:** Guided Self-Directed Learning via LLMs and the Role of the Instructor
**PI:** Dr. Iyadunni (Dunni) Adenuga, Kean University. IRB-FY2026-340 (under review)
**Version:** 2.2, July 29, 2026. Supersedes v2.1 (July 29) and the July 22 draft.

**What changed in v2.2:** per-participant study accounts, each pre-loaded with an identical clone of the demo course (replacing the shared account and the pre-created sandbox); Part A rewritten to follow the platform's real course-creation flow, verified against the setup-mode interface; four wording corrections from a line-by-line code verification of the instruction-injection and quiz-generation paths; an instructions-v1 capture step added (the platform keeps no version history); a temporal interview question (Q5b); and a session booking buffer. Appendix A records every claim and how it was checked.

---

## 1. Research Questions

- **RQ-A.** How do instructors express pedagogical intent as natural-language constraints on an LLM tutor, and how do they verify the tutor honors those constraints?
- **RQ-B.** How do instructors calibrate trust in LLM-generated analytics (risk tiers, Insights Assistant answers, daily briefings)? What verification strategies do they use, and where do they over- or under-rely?
- **RQ-C.** What tensions do instructors perceive between monitoring affordances (session replay, watchlists, risk tiers) and their pedagogical relationship with students?

Method: a single session per participant (96 minutes planned, 105 booked), combining think-aloud on the live deployed system (two task blocks), a semi-structured interview, and a short survey. N = 10–14 (Kean CS core plus 4–6 external intro-programming instructors, remote). Reflexive thematic analysis with disclosed, bounded LLM assistance. The Expert-in-the-Loop concept appears only as a sensitizing lens in the paper's discussion.

---

## 2. Accounts, Environment, and Session Structure

### Study accounts (one per participant)

Each participant receives a dedicated instructor account (P01 through P14), created in advance by the researcher with alias credentials so no extra personal information is collected. Each account is pre-loaded with an **identical clone of the "CPS 1231-Full Semester" demo course**: 20 synthetic students, 15 published topics, roughly 1,100 quiz attempts, and the seeded probe student Maya R. Timestamps in each clone are shifted so the most recent activity falls about two days before the session, so every participant sees a genuinely live-reading week-10 class.

This design means: no shared state between participants, no cleanup between sessions, no mid-session account switching, byte-identical starting conditions for every participant (which strengthens the probe comparisons), and each account becomes a frozen data artifact after its session. The template course stays in the researcher account (javatutor) and is never used in sessions. A single sandbox **student** account, running in a second browser window, is used for the role-play task; students join courses by access code, so it interacts only with the course the participant creates.

### Session structure (96 minutes planned, 105 booked)

| Time | Block | RQ |
|---|---|---|
| 0:00–0:05 | Intro, consent, recording, screen-share check | n/a |
| 0:05–0:10 | Background mini-interview (teaching load, intro course taught, prior AI-tool use) | context |
| 0:10–0:44 | **Part A: authoring-and-verification loop** (A1–A6): the participant creates a course from scratch and tests it | RQ-A |
| 0:44–1:13 | **Part B: monitoring scenario** on the pre-loaded week-10 course (B1–B5; probes in B1–B3) | RQ-B, RQ-C |
| 1:13–1:25 | **Part C: post-task interview** (Q1–Q10, plus Q5b) | all |
| 1:25–1:31 | Survey (SUS-10, custom items, open text) | all |
| 1:31–1:36 | **Debrief:** disclose all three probes; probe-reveal questions (Q11–Q12); keep-or-delete decision on authored content | RQ-B |

B5 is droppable if the session runs past 1:10. The probes live in B1–B3, so coverage survives the cut. The debrief is protected time. The 9-minute booking buffer absorbs overruns without sacrificing content.

### Pre-session setup checklist (researcher)

1. **In advance, once:** run the provisioning script (Section 6): create accounts P01–P14, seed Maya R. into the template course, clone the template into every account with date shifting. Verify each clone's tier mix and Maya's row during provisioning.
2. **Per session:** confirm the participant's account logs in; confirm the cloned course shows 1 Critical (Maya, about 75), 1 High (Budi Kim, 44), 5 Watch; confirm the course's Insights Assistant chat is empty (clones start fresh).
3. Stage the syllabus file on the session machine: the participant's own syllabus if they sent one (offered in the recruitment email), otherwise the generic intro-programming syllabus.
4. Second browser window signed in as the sandbox student account.
5. Probe hooks (Section 6) enabled and verified against this participant's clone.
6. Moderator session log open; it includes a field for capturing the participant's instructions v1 text before the revision step (A6).

---

## 3. Part A: Authoring-and-Verification Loop (34 min) [RQ-A]

The participant builds a course the same way a real instructor would, following the platform's actual creation flow: name the course, then work down the course page in its own order (AI teaching instructions, Course materials, Topic plan chat), generate the topic plan, review it, configure assessment, publish, and then test the tutor from the student side.

**Standing instruction (read once, before A1):** *"Please think out loud the whole time: say what you're looking at, what you expect, what surprises you. There are no right answers; we're studying the system, not you. I can't answer questions about whether the system is correct while you work."* (The last sentence licenses the probes without lying.)

**A1. Create the course (2 min).** *"Go to Courses and create a new course. Name it after the intro programming course you actually teach."*

- Verified flow: entering a name and clicking Create makes the course instance immediately; the course page opens in setup mode (single column: AI teaching instructions, Course materials, Topic plan chat, then the empty Topics list).

**A2. Write teaching instructions (5 min).** *"Find the card titled 'AI teaching instructions'. Write the rules you'd want an AI tutor to follow with your actual students. Anything you'd tell a human TA is fair game: how to explain, what to never do, what examples to use. Take about five minutes and narrate your choices as you write. Save when done."*

- Verified: the card saves to `Course.globalInstructions` and is injected at the top of the tutor's per-turn instruction prompt under the header "Instructor Global Guidelines (authoritative for this course)"; a fixed system message directs the model to follow it, and a safety floor in that system message cannot be overridden by instructor prose. The instructions also flow into study-plan generation. **They do NOT flow into quiz generation** (verified absent from the entire quiz path). If a participant writes quiz rules here and the quizzes ignore them, that is an expressiveness-gap finding, not tutor disobedience; the moderator does not correct it in-session, and Q1's follow-up captures it.
- Note: the card's placeholder text shows three example rules; a mild priming influence on A2 is acknowledged in limitations (or the placeholder is blanked in the study build).

**A3. Upload the syllabus and generate the topic plan (5 min).** *"Under Course materials, upload this syllabus and mark it as the syllabus. Then, in the Topic plan chat, describe how you want the topics structured, and generate the plan. Narrate what you're asking for and why."*

- Verified: materials upload with a syllabus marker exists; the Topic plan chat takes a free-text description and a Generate action; generated topics appear as drafts in the Topics list. Generation shows staged progress and takes seconds to about a minute.

**A4. Review drafts and configure a quiz pattern, approve, publish (8 min).** *"Skim the drafts the system generated. Do they match your syllabus? Now open one topic you know well and click Edit. In the Quiz Pattern section, set it up the way you'd actually assess this module: the number of questions, the cognitive level, the difficulty mix, and any instructor notes. Narrate your choices. Save, then Approve and Publish that topic."*

- Verified editable fields (Topic Editor): Question count (3–10, enforced as an exact count and clamped server-side), Cognitive level (all six Bloom levels), Difficulty mix (easy/medium/hard percentages, phrased to the model as a guide rather than enforced), and "Instructor notes" (free text, up to 1000 characters), which **does** reach quiz generation as "Additional instructor constraints." Question-type weights exist in the data model but have no UI; the script must not ask for them.
- Verified lifecycle: draft, then Approve, then Publish, per topic row; a student can only start a published topic (unpublished returns an error).

**A5. Role-play as a student (9 min).** *"Now you'll be one of your own students. This second window is signed in as a student account. Join your new course with its access code, open the topic you just published, and start learning. First, act like a student genuinely trying to learn. Then comes the fun part: act like a student trying to get around your rules. Try to make the tutor do something you just told it not to do. Narrate whether the tutor is honoring your instructions."*

- Verified: students join by access code (shown on the course header with a Copy button); a separate student account is required because instructor sign-ins redirect away from student routes and lack the learner profile that shapes tutor behavior. If the tutor refuses an extreme instruction, that is the platform's safety floor by design; it feeds the accountability discussion in Q4.

**A6. Verdict and revise (5 min).** Before this task, the moderator copies the current instructions text into the session log (the platform keeps no version history; revising overwrites v1 in the database). Then: *"Give me a verdict: is the tutor following your instructions? What's your evidence? Now revise your instructions to fix anything you didn't like, and tell me what you'd still need to see before you'd let this run in your real course."*

- Verified: the tutor re-reads the instructions on every message, so the revision takes effect on the very next student message. If time allows, invite one quick re-test exchange in the student window.
- Data artifacts: instructions v1 (moderator-captured) and v2 (in the course record), the topic plan and quiz pattern, and the role-play transcript (recorded by the platform).

---

## 4. Part B: Monitoring Scenario (29 min) [RQ-B, RQ-C]

**Framing read aloud:** *"The other course in your account, 'CPS 1231-Full Semester', is your running class at week 10: 20 students, 15 topics. You have limited time, like always."* (No account switch: the cloned course sits in the participant's own account.)

**B1. Briefing review (5 min), contains Probe 3 [RQ-B].** On the Dashboard: *"Start where you'd start on a normal morning. Read Today's Briefing as you would over coffee, and tell me: what, if anything, would you actually do today based on it?"*

- **Probe 3 (verified feasible):** the briefing is generated per-request by an LLM; a deterministic, env-flagged hook appends one overgeneralized sentence for study accounts, for example: *"Most of the class has gone quiet this week; engagement is dropping sharply across the course."* Ground truth is on the same screen: the Need-attention card and the KPI tiles below the briefing contradict it. Classification: swallowed / checked / challenged.
- Gating note: the briefing is cross-course per account, so the hook gates on the study accounts (P01–P14). Since each participant owns only their new course and the clone, the planted sentence lands in a clean context.

**B2. Triage (8 min), contains Probe 1 [RQ-B, RQ-C].** In the Full Semester course: *"You have time to personally reach out to exactly two students this week. Use the dashboard and watchlist to decide which two, and draft one sentence of what you'd say to each. Walk me through how you're deciding."*

- **Probe 1 (corrected and verified against the risk formula).** Every clone contains "Maya R.", whose **Critical tier contradicts her quality of work**. Verified-feasible profile: of 15 published topics she touched exactly one, with 8 quiz attempts scoring 95 seven times and then a final failing 58. The shipped formula yields an engagement signal of 0.9 (untouched-topic coverage, not login recency), a pass-rate signal of 1.0 (latest attempt failed), and a quiz signal of 0 (average 90.4), producing a **risk score near 75, Critical**, with flags "no engagement," "low pass rate," and "stuck topic," while her row and Monitor page show **avg 90.4%**. The data reads as a strong student who went quiet mid-course with one unresolved fail.
- Verified: no automatic "doing well" override exists to self-correct the tier (the only override is a manual instructor setting), and her enrollment dates clear the 7-day new-enrollment grace rule after the clone's date shift.
- Classification: accepts the Critical tier at face value / drills into her Monitor page / notices the contradiction. Triage picks and drafted outreach sentences are recorded.

**B3. Insights Assistant (6 min), contains Probe 2 [RQ-B].** *"You're planning next week's lecture and want to reteach whatever the class struggled with most. Ask the Insights Assistant whatever you'd naturally ask, and decide what to reteach. You can use anything else on the dashboard too."*

- **Probe 2 (corrected with real course data, verified live July 29).** The course's true weakest topic by first-attempt pass is **Arrays: Sorting and Searching at 56%** (then Variables and Data Types 58%, Conditional Statements 59%). The planted answer claims **"Methods has the lowest first-attempt pass rate at 63%"**: a real topic, its real number, the wrong rank (fifth-hardest). The truth is two clicks away in the "Quiz difficulty by topic" table. Implementation: a deterministic canned reply (env-flagged) returned when a probe-flagged course is in scope and the message matches weakest/struggle/lowest/reteach patterns; the exchange persists to the chat transcript.
- Classification: cross-checks the table / accepts and plans to reteach Methods / asks the assistant to justify.

**B4. Session replay (6 min) [RQ-C, RQ-B].** *"Isabela Zhao has a 1:1 with you tomorrow. Use her Monitor page, including session replay down to her individual quiz answers, to prepare. Then tell me: in the meeting, what would you say to Isabela about how you prepared? Would you tell her you watched her replays?"*

- Verified: Isabela Zhao exists in the cohort (Watch tier, 30/100, 13 of 15 topics touched, the richest replay material in the class). The Monitor page has per-topic progress, session replay to the quiz-answer level, and functional course- and topic-scoped instructor notes. The disclosure question is the behavioral surveillance probe.

**B5. Syllabus disclosure (4 min, droppable) [RQ-C].** *"The department asks you to write two sentences for the syllabus telling students what the instructor can see about their AI-tutor use in this system. Write them. Say out loud anything you're tempted to leave out, and why."*

---

## 5. Interview, Survey, and Mapping

### Part C interview guide (Q11–Q12 only after debrief)

1. **[RQ-A]** "When you wrote your teaching instructions, who did it feel like you were writing to: a TA, a machine, a legal document?" Follow-ups: *What did you leave out because you doubted the AI could follow it? Was there anything you wrote that didn't seem to take effect anywhere?* (captures the instructions-versus-quiz scope gap)
2. **[RQ-A, delegation]** "What is something you would never let the AI tutor do in your course, no matter how good it got?" Follow-ups: *Where's the line between that and what you delegated today? Has that line moved in the last hour?*
3. **[RQ-A, verification sufficiency]** "You role-played as a student for about nine minutes. Is that enough evidence that the tutor will honor your rules across a whole semester?" Follow-ups: *What would 'enough' look like? Whose job is that ongoing checking: yours, the platform's, nobody's?*
4. **[RQ-A/B, accountability]** "Suppose the tutor teaches a student something wrong, or solves their homework despite your instructions, and it affects their grade. Who is responsible?" Follow-ups: *Does writing the instructions yourself make you more or less responsible? What would you say to the student?*
5. **[RQ-B, verification sufficiency]** "Before you'd act on a risk tier, say by emailing a student's advisor, what would you need to see first?" Follow-ups: *You drilled into some students' pages and not others; what made the difference? Is the 0–100 score itself meaningful to you, or just the tier?*
   - **Q5b [temporal].** "Everything you saw today was week-10 data. Walk me back to week 4 of the same course: what would you use this dashboard for then, and what would you ignore?"
6. **[RQ-B]** "The Insights Assistant and the briefing both make claims about your class in plain English. How do you decide when a claim like that needs checking?" Follow-ups: *Did you check any today? What triggered it, or what let you skip it?*
7. **[RQ-C, surveillance]** "How do you think your actual students would feel knowing you can replay their tutoring sessions down to each quiz answer?" Follow-ups: *Would knowing they're watched change how they use the tutor? Is there anything in this dashboard you'd rather not be able to see?*
8. **[RQ-C]** "Does this kind of monitoring change what kind of teacher you are to a struggling student?" Follow-ups: *Help or surveillance: where's the line? Do the tier labels ('Critical', 'High') change how you'd feel walking into class?*
9. **[RQ-B/C, institutional gaze]** "If your department chair could see this same dashboard for your course, would that change anything?" Follow-up: *What about tiers visible to advisors or retention offices?*
10. **[adoption]** "Concretely: what would have to be true for you to run your actual course on this in the spring?" Follow-up: *What's the first thing that would make you turn it off?*

(Debrief: disclose the three probes.)

11. **[RQ-B, probe reveal]** "You saw all three of those today: Maya's Critical flag, the assistant's 'Methods' answer, and the briefing's 'class going quiet' line. Did anything feel off in the moment?" Follow-up: *(If caught:) What tipped you off? (If not:) What would have helped you catch it?*
12. **[RQ-B, probe reveal]** "Now that you know the system can be wrong in these ways, does that change your answer about acting on its outputs?" Follow-up: *Would you want the system to show its uncertainty, and would you actually look at it?*

### Survey (Qualtrics, about 6 min)

Block 1: **SUS**, standard 10 items, 5-point scale (continuity with Phase 1).

Block 2: custom items, 7-point Likert (1 = strongly disagree, 7 = strongly agree):

- **S1 [RQ-B]** "I would act on this system's risk tiers without checking the underlying student evidence myself."
- **S2 [RQ-B]** "When the Insights Assistant or the briefing made a claim about the class, I could tell whether it was accurate."
- **S3 [RQ-A]** "The AI teaching instructions gave me enough control over how the tutor would teach my students."
- **S4 [RQ-A/B]** "If the AI tutor gave a student bad guidance in my course, I would consider myself responsible for it."
- **S5 [RQ-C]** "Reviewing individual students' session replays is an appropriate part of my role as their instructor."
- **S6 [adoption]** "I would use this system in a course I am teaching within the next year."

Block 3, open text:
- **O1:** "Describe one specific moment today when you trusted, or distrusted, something the system told you, and why."
- **O2:** "What is the single change this system most needs before you would use it with real students?"

### RQ to data mapping

| RQ | Tasks | Interview | Survey | Analysis output |
|---|---|---|---|---|
| RQ-A | A1–A6 | Q1–Q4 | S3, S4, O2 | Constraint-authoring pattern catalog (including the instructions-versus-quiz scope gap); verification-strategy taxonomy for constraint adherence; instructions v1-to-v2 revision diffs as artifacts |
| RQ-B | B1–B3 (probes), B4 | Q4–Q6, Q5b, Q11–Q12 | S1, S2, O1 | Per-probe reliance matrix (noticed / verified / propagated, 3×N); verification-strategy taxonomy for analytics; calibration cross-read of S1/S2 self-report against observed probe behavior; stated week-4-versus-week-10 usage differences (discussion material) |
| RQ-C | B4, B5, B2 tier language | Q7–Q9 | S5, O1 | Tension typology (visibility, disclosure, tier stigma, institutional gaze) grounded in behavioral disclosure decisions |

---

## 6. Implementation Prep (engineering, before first session)

All probe code ships behind a `STUDY_PROBE` env flag on the IITL backend, enabled only for the study window and removed after. Estimated total: about 40 lines of hooks plus one provisioning script.

1. **Provisioning script** (`backend/scripts/provisionStudyEnvironment.js`, prompt already drafted): seeds Maya R. into the template course with the verified profile (one touched topic; attempts 95 seven times then 58; enrollment and earliest activity backdated at least 8 days); creates accounts P01–P14; clones the template course with all student activity into each account with rewritten IDs, regenerated access codes, and a per-clone date shift landing the latest activity about two days before the session. Supports dry-run and manifest-based rollback. Acceptance checks built in: per clone, tier mix 1 Critical / 1 High / 5 Watch, Maya at about 75 with avg 90.4% visible, session replay chain resolving.
2. **Insights Assistant hook** (roughly 8–12 lines in the instructor-chat route): when the scoped course is in the probe-course list (from the provisioning manifest, supplied as an env value) and the message matches weakest/struggle/lowest/reteach patterns, return the canned "Methods, 63%" reply instead of calling the agent; persist the exchange as usual.
3. **Briefing hook** (roughly 5–8 lines in the briefing route, after generation): for study accounts P01–P14, append the canned overgeneralization sentence.
4. **Sandbox student account** created; second browser window prepared on the session machine.
5. **Syllabus files** staged: generic intro-programming syllabus, plus any participant-sent syllabi.
6. **Moderator session log template**: includes fields for the instructions v1 capture (before A6), triage picks, probe classifications, and timestamps.

## 7. Recruitment, Ethics, Analysis, Timeline

**Participants (N = 10–14).** Core: Kean CS/IT faculty teaching intro programming (n = 6–8), recruited via the department listserv and PI email; sessions run by the student researcher, not the PI; anyone supervising the student researcher is excluded. External (n = 4–6): intro-programming instructors elsewhere (adjuncts and lecturers welcome), via the SIGCSE listserv and snowball, remote over Teams with participant screen control. The recruitment email invites participants to send the syllabus of their intro course in advance. Incentive: $50 gift card. Stop between 12 and 14 on saturation.

**IRB (submission IRB-FY2026-340, under review; updates fold into the pending revision, no separate amendment cycle):**
1. Consent adds one sentence: "Some aspects of the system's behavior will not be fully described until after the session." (Deception is permitted under XM3 with prospective agreement; a scripted debrief and a post-debrief data-withdrawal right are added.)
2. Procedures add two or three sentences describing the authoring block (a new activity and a new data type: instructor-authored teaching artifacts, with an end-of-session keep-or-delete decision).
3. Replace the interview script and survey attachments with the versions in this document; update study dates, session length (105 minutes booked), and N.

**Analysis.** Rolling pipeline: same-day transcription via local Whisper (on-device; audio never leaves the study machine); a familiarization memo within 48 hours of each session. LLM assistance is disclosed and bounded: transcript cleanup and per-transcript familiarization summaries read against the raw transcript, never instead of it; no LLM proposes codes, assigns codes, or writes themes. Reflexive TA (Braun and Clarke): the student researcher codes all data, the PI reads 100% of transcripts and reviews the codebook at checkpoints (reflexive review, not IRR; rationale reported). Codebook v1 after session 3; revisions after sessions 6 and 10; saturation checkpoint at 10. Probe analysis is deductive and parallel: each participant-probe pair is classified noticed / verified / propagated; Q11–Q12 are coded for post-hoc rationalization versus genuine detection. Triangulation is explicitly disconfirmatory (S1 "wouldn't act without checking" plus propagated probes equals a miscalibration finding). Instructions revision diffs are coded alongside talk.

**Timeline (from July 29, 2026):**

| Week of | Milestone |
|---|---|
| Aug 3 | IRB revision submitted (this document is the substrate). Provisioning script built and dry-run; probe hooks implemented and tested. Session script piloted once internally. Qualtrics built. |
| Aug 10 | IRB clearance assumed (the single biggest schedule risk). Provisioning applied; recruitment out the same day. Sessions 1–3. Codebook v1 after session 3. |
| Aug 17 | Sessions 4–7 (first externals). Codebook v2. |
| Aug 24 | Sessions 8–10. Theme development on the partial corpus; methods section drafted. |
| Aug 31 | Sessions 11–12 if needed. Probe matrix complete for N of at least 10. Findings drafted. |
| Sep 4–11 | **CHI 2027 submission**: N = 10–12, themes developed (not exhaustively saturated), honestly reported. |
| Sep–Oct | Sessions 13–14 (external stragglers); full-corpus refinement. |
| ~Oct | **LAK 2027 submission**: full N, complete saturation, matured probe analysis. |

Go/no-go: if IRB clearance slips past **August 17**, CHI 2027 is off and LAK becomes primary. Decide at the checkpoint, not on September 3.

**Framing notes for the paper.** EitL is a sensitizing lens in the discussion only; the genuine delta against Holstein-style teacher-AI co-orchestration is asynchronous, pre-hoc constraint authoring plus retrospective monitoring for third-party benefit, argued against the specific papers. Connect "AI teaching instructions" to end-user prompt-programming (Zamfirescu-Pereira et al.). The appropriate-reliance thread is engaged empirically through the probes. Cross-domain table: one motivating paragraph plus one future-work sentence, never in contributions. Limitations stated plainly: a single-institution-skewed convenience sample (mitigated by externals), scenario-based monitoring evidence with synthetic students (mitigated by the participant-authored course and, where provided, their real syllabus), placeholder-text priming in the instructions card, and no student-side data in this phase (the learner vertex is future work: a Fall 2026 real-semester deployment).

---

## Appendix A: Verification Ledger

Every design-relevant claim in this plan, and how it was verified. Code references are file:line in the repo at commit `be91a60`; live checks were performed July 29, 2026 on studyassist-iitl-keanu.web.app.

| # | Claim in plan | Verification |
|---|---|---|
| 1 | Risk formula = 100×(0.40·engagement + 0.30·passRate + 0.20·quizScore + 0.10·struggle); tiers Critical at 70+, High at 40+, Watch at 20+ | `milestoneAnalyticsService.js:237, 380–385, 396–399` |
| 2 | Engagement signal measures published-topic coverage, NOT login recency; engagement alone caps the score at 40 (the High boundary), so an earlier draft's "Critical from stopped logins" was impossible | `milestoneAnalyticsService.js:369–378` plus the in-code comment at `:387–391` |
| 3 | Maya profile (1 of 15 topics touched; 95 seven times then 58 across 8 attempts) yields about 75 Critical with a visible avg of 90.4% and flags no-engagement, low-pass-rate, stuck-topic | Computed against the formula components; attempt semantics (`passed = scorePct >= 60`) at `quizRoutes.js:827–828` |
| 4 | No automatic "doing well" override removes a high-scoring student from at-risk; the only override is manual and instructor-set | `milestoneAnalyticsService.js:698–699`; enum at `InstructorStudentNote.js:43–46` |
| 5 | New enrollments read healthy for 7 days (Maya's seed backdated at least 8 days; clone date shift preserves this) | R1 rule, `milestoneAnalyticsService.js:285–303` |
| 6 | Teaching instructions save to `Course.globalInstructions` and are injected into every tutoring turn and into plan generation, but NOT quiz generation | Save: `instructorRoutes.js:160, 191`. Injection: `chatRoutes.js:177–193` loads per request; all five `buildTeacherPrompt` call sites (`:846, :1083, :1338–1345, :2046, :2272`) pass it; block built at `teacher_prompt.js:529–534`. Plan path: `assessmentRoutes.js:30–46` into `srl_assessment_prompt.js:130–137`. Quiz gap: `globalInstructions` absent from `quizRoutes.js`, `quizAgent.js`, `studyGraph.js` (grep) |
| 7 | The instructions block rides in the tutor's per-turn instruction prompt (final user message); a fixed system message directs the model to follow it and provides a safety floor instructor prose cannot override | `teacherService.js:33–38` (system message), `:76–84` (prompt pushed as final user message); safety-floor comment at `teacher_prompt.js:526–528` |
| 8 | Instructions are re-read on every message, so an A6 revision takes effect on the next student message in the same session | Per-request load at `chatRoutes.js:177–193` (inside the message handler) |
| 9 | `Course.globalInstructions` has no version history; revision overwrites v1 (hence the moderator capture step in A6) | Plain String field, `Course.js:61`; in-place PATCH at `instructorRoutes.js:191` |
| 10 | Quiz pattern editable fields: question count 3–10 (exact, clamped), cognitive level (six Bloom levels), difficulty mix (a guide in the prompt, not enforced), "Instructor notes"; question-type weights have no UI | Schema `CourseTopic.js:3–21`; UI `InstructorTopicEditorPage.jsx:105–144` (QUESTION_TYPES declared `:13`, never rendered); prompt phrasing in `buildQuizPatternAppend`, `quizRoutes.js:48–64`; clamp at `:580` |
| 11 | The "Instructor notes" field reaches quiz generation as "Additional instructor constraints" | `quizRoutes.js:59–61`, appended at `:131` |
| 12 | Students join by access code; auth required, student role not enforced; a published topic is required to start | `enrollmentRoutes.js:14–51` (join), `:126–142` (403 TOPIC_NOT_PUBLISHED) |
| 13 | A separate sandbox student account is needed (instructor sign-in redirects away from student routes; instructor accounts lack the learner profile the tutor consumes) | `SignIn.jsx:28, 55`; `InstructorOnboarding.jsx:20` |
| 14 | Course creation flow: name creates the instance; setup-mode page order is AI teaching instructions, Course materials, Topic plan chat, Topics list | Live check July 29 (new-course screenshot, setup-mode single-column layout); D3 state-dependent layout in `InstructorCourseDetailPage.jsx` |
| 15 | Assistant probe hook location and size (roughly 8–12 lines) | POST handler in `instructorChatRoutes.js:56–104`; single agent call site at `:80–87` |
| 16 | Briefing probe hook location and size (roughly 5–8 lines); the briefing is cross-course per account, so the hook gates on study accounts | `analyticsRoutes.js:639–646`; `instructorBriefingAgent.js:62–82` (500-character truncation inside the agent; append after) |
| 17 | Demo course weakest topics by first-attempt pass: Arrays: Sorting and Searching 56%, Variables 58%, Conditional 59%, Number Systems 60%, Methods 63%; the probe's wrong answer names a real topic with its real number but the wrong rank; no "Recursion" topic exists | Live check July 29: Insights, Course health, Quiz difficulty by topic |
| 18 | Isabela Zhao (B4 target) exists: Watch tier 30/100, 13 of 15 topics touched, the richest replay material | Live check July 29: Who should I reach? |
| 19 | Template course tier mix before Maya: 0 Critical, 1 High (Budi Kim 44), 5 Watch, 14 Healthy; Maya's seed adds the lone Critical, making B2 triage natural | Live check July 29: risk distribution chart |
| 20 | The briefing sits on the Dashboard beside the Need-attention card with KPI tiles below, so Probe 3's ground truth is on-screen | Live check July 29: Dashboard |
| 21 | Monitor page: per-topic progress, session replay to the quiz-answer level, instructor notes (course- and topic-scoped, both functional), 5-week risk trend | `analyticsRoutes.js:316, 363, 489+`; live check |
| 22 | Clone feasibility: six collections hang off a course (Course, CourseTopic, Enrollment, Session, MilestoneAttempt, plus Quiz/QuizAttempt via sessionId); synthetic student users are shared; quiz attempts are embedded in Session docs; access codes are unique per course and regenerate on create | Model survey July 29: `models/` field references; `Course.js:95` (unique accessCode index), `:98–103` (pre-save generation) |

**Corrections from v2.1, for the record:** the shared study account and the pre-created sandbox course were replaced by per-participant accounts with cloned, date-shifted demo courses (confidentiality between participants, identical starting states, no resets). Part A was rewritten to the platform's real creation flow after the setup-mode interface check showed the old positional wording ("on the right") was wrong for a new course. "System prompt" was corrected to "per-turn instruction prompt" after tracing the message assembly in `teacherService.js`. The A6 artifact claim was corrected: instructions v1 is overwritten in the database on revision, so the moderator now captures it before the revision step. Two precision notes were added: the Quiz Pattern's "Instructor notes" do reach quiz generation, and the difficulty mix is a guide rather than an enforced constraint. Q5b (week-4 versus week-10 usage) was added to capture the temporal dimension verbally after the two-scenario comparison was rejected on probe-contamination grounds.
