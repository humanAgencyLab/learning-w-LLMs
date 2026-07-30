# Study Plan: Instructor Study (Clean, Verified Version)

**Study:** Guided Self-Directed Learning via LLMs and the Role of the Instructor
**PI:** Dr. Iyadunni (Dunni) Adenuga, Kean University. IRB-FY2026-340 (under review)
**Version:** 2.1, July 29, 2026. Supersedes the July 22 draft.

**What changed in v2.x:** every task, probe, and question was cross-checked against the deployed system (studyassist-iitl-keanu.web.app, walked July 29) and the codebase (file-and-line verification). Three probe designs were corrected because the drafts referenced impossible score profiles, nonexistent topics, and nonexistent students. A verification ledger (Appendix A) records each claim and how it was checked.

---

## 1. Research Questions

- **RQ-A.** How do instructors express pedagogical intent as natural-language constraints on an LLM tutor, and how do they verify the tutor honors those constraints?
- **RQ-B.** How do instructors calibrate trust in LLM-generated analytics (risk tiers, Insights Assistant answers, daily briefings)? What verification strategies do they use, and where do they over- or under-rely?
- **RQ-C.** What tensions do instructors perceive between monitoring affordances (session replay, watchlists, risk tiers) and their pedagogical relationship with students?

Method: a single 90-minute session per participant, combining think-aloud on the live deployed system (two task blocks), a semi-structured interview, and a short survey. N = 10–14 (Kean CS core plus 4–6 external intro-programming instructors, remote). Reflexive thematic analysis with disclosed, bounded LLM assistance. The Expert-in-the-Loop concept appears only as a sensitizing lens in the paper's discussion.

---

## 2. Session Structure (90 minutes)

| Time | Block | RQ |
|---|---|---|
| 0:00–0:05 | Intro, consent, recording, screen-share check | n/a |
| 0:05–0:12 | Background mini-interview (teaching load, intro course taught, prior AI-tool use) | context |
| 0:12–0:38 | **Part A: authoring-and-verification loop** on a pre-created sandbox course (A1–A4) | RQ-A |
| 0:38–1:07 | **Part B: monitoring scenario** on the Dashboard and the week-10 demo course (B1–B5; probes in B1–B3) | RQ-B, RQ-C |
| 1:07–1:19 | **Part C: post-task interview** (Q1–Q10) | all |
| 1:19–1:25 | Survey (SUS-10, custom items, open text) | all |
| 1:25–1:30 | **Debrief:** disclose all three probes; probe-reveal questions (Q11–Q12); keep-or-delete decision on authored content | RQ-B |

B5 is droppable if the session runs past 1:05. The probes live in B1–B3, so coverage survives the cut. The debrief is protected time.

**Demo course.** Part B uses the "CPS 1231-Full Semester" demo course: 20 synthetic students, 15 published topics, roughly 1,100 quiz attempts. It reads as week 10 of a semester. (The week-4-scale "Mid Semester" course exists as a backup scenario but is not used in the main protocol; one scenario keeps the session inside 90 minutes.)

**Pre-session setup checklist (researcher, about 15 minutes per participant):**
1. Create the participant's sandbox course ("Sandbox P##") with an intro-programming syllabus uploaded and a topic plan generated as drafts. If the participant sent their own syllabus in advance (offered in the recruitment email), load that instead: higher fidelity at zero session cost.
2. Confirm the seeded probe student ("Maya R.", Probe 1 in Section 4) is present in the Full Semester course and her watchlist row reads as specified.
3. Confirm the two probe hooks (Section 6) are enabled for the demo course and study instructor account.
4. Confirm the sandbox student account logs in and is not yet enrolled in the participant's sandbox course.
5. Reset the demo course's Insights Assistant chat history (Clear).

---

## 3. Part A: Authoring-and-Verification Loop (25 min) [RQ-A]

**Standing instruction (read once, before A1):** *"Please think out loud the whole time: say what you're looking at, what you expect, what surprises you. There are no right answers; we're studying the system, not you. I can't answer questions about whether the system is correct while you work."* (The last sentence licenses the probes without lying.)

**A1. Write teaching instructions (5 min).** *"This is a sandbox course set up like the intro programming course you teach. On the right you'll find a card called* AI teaching instructions. *Write the rules you'd want an AI tutor to follow with your actual students. Anything you'd tell a human TA is fair game: how to explain, what to never do, what examples to use. Take about five minutes and narrate your choices as you write."*

- Verified: the card exists on the course page (labeled "AI teaching instructions"), saves to `Course.globalInstructions`, and is injected into the student tutor's system prompt as "Instructor Global Guidelines (authoritative for this course)" and into study-plan generation. **It does NOT flow into quiz generation.** Only the quiz pattern does. If a participant writes quiz rules into the instructions box and the quizzes ignore them, that is a genuine expressiveness-gap finding, not tutor disobedience; the moderator does not correct it in-session, and Q1's follow-up captures it.

**A2. Configure a quiz pattern, approve, publish (6 min).** *"Open one of the draft topics you know well and click Edit. In the Quiz Pattern section, set it up the way you'd actually assess this module: the number of questions, the cognitive level, the difficulty mix, and any instructor notes. Narrate your choices. Then go back and Approve and Publish that topic."*

- Verified editable fields (from the Topic Editor): Question count (3–10), Cognitive level (all six Bloom levels, remember through create), Difficulty mix (easy/medium/hard percentages), and "Instructor notes" (free text, up to 1000 characters). Question-type weights exist in the data model but have no UI; the script must not ask for them. The pattern verifiably flows into student quiz generation (`resolveQuizPatternForModule` feeds the quiz prompt).
- Verified lifecycle: draft, then Approve, then Publish buttons exist per topic row; a student can only start a **published** topic (unpublished returns an error).

**A3. Role-play as a student (9 min).** *"Now you'll be one of your own students. In this second browser window, you're logged in as a student account. Join your sandbox course with this access code, open the topic you just published, and start learning. First, act like a student genuinely trying to learn. Then comes the fun part: act like a student trying to get around your rules. Try to make the tutor do something you just told it not to do. Narrate whether the tutor is honoring your instructions."*

- Verified: students join by access code (`POST /join`; the code sits on the course header with a Copy button). A separate sandbox student account is used because instructor accounts are redirected away from student routes at sign-in and lack the SRL student profile that shapes tutor behavior. The sandbox student runs in a second browser window prepared before the session.

**A4. Verdict and revise (5 min).** *"Give me a verdict: is the tutor following your instructions? What's your evidence? Now revise your instructions to fix anything you didn't like, and tell me what you'd still need to see before you'd let this run in your real course."*

- Data artifacts: instruction v1 and v2 texts (saved in the course record), quiz pattern settings, and the role-play transcript (the student session is recorded in the platform).

---

## 4. Part B: Monitoring Scenario (29 min) [RQ-B, RQ-C]

**Framing read aloud:** *"For this part, pretend the 'CPS 1231-Full Semester' course is your class at week 10: 20 students, 15 topics. You have limited time, like always."*

**B1. Briefing review (5 min), contains Probe 3 [RQ-B].** On the Dashboard: *"Start where you'd start on a normal morning. Read Today's Briefing as you would over coffee, and tell me: what, if anything, would you actually do today based on it?"*

- **Probe 3 (verified feasible):** the briefing text is generated per-request by an LLM; a deterministic hook (env-flagged, roughly 5–8 lines in the briefing route) appends one overgeneralized sentence for the study instructor's account, for example: *"Most of the class has gone quiet this week; engagement is dropping sharply across the course."* Ground truth is visible on the same screen: the Need-attention card shows 3 students and the KPI tiles directly below the briefing show stable session counts. Classification: swallowed / checked / challenged.
- Note: the briefing is cross-course for the instructor account (no per-course scoping), so the hook gates on the study instructor's ID. Verified against the briefing route.

**B2. Triage (8 min), contains Probe 1 [RQ-B, RQ-C].** In the Full Semester course: *"You have time to personally reach out to exactly two students this week. Use the dashboard and watchlist to decide which two, and draft one sentence of what you'd say to each. Walk me through how you're deciding."*

- **Probe 1 (corrected and verified against the risk formula).** We seed one synthetic student, "Maya R.", whose **Critical tier contradicts her quality of work**. Verified-feasible profile: of 15 published topics she touched exactly **one**, where she made 8 quiz attempts scoring 95, 95, 95, 95, 95, 95, 95, then a final failing 58. The shipped formula then yields an engagement signal of 0.9 (untouched-topic coverage, not login recency), a pass-rate signal of 1.0 (her latest attempt failed), a quiz signal of 0 (average 90.4), and struggle 7/8. Result: **risk score near 75, Critical**, with flags "no engagement," "low pass rate," and "stuck topic," while her row and Monitor page show **avg 90.4%**. The story the data tells: a strong student who went quiet mid-course with one unresolved fail.
- Verified: there is **no automatic "doing well" override** that would remove her. The only override is a manual instructor setting, so the system will not self-correct and defeat the probe. Her enrollment is backdated at least 8 days to clear the new-enrollment grace rule.
- Classification: accepts the Critical tier at face value / drills into her Monitor page / notices the contradiction. Both triage picks and the drafted outreach sentences are recorded.

**B3. Insights Assistant (6 min), contains Probe 2 [RQ-B].** *"You're planning next week's lecture and want to reteach whatever the class struggled with most. Ask the Insights Assistant whatever you'd naturally ask, and decide what to reteach. You can use anything else on the dashboard too."*

- **Probe 2 (corrected with real course data, verified live July 29).** The demo course's true weakest topic by first-attempt pass is **Arrays: Sorting and Searching at 56%** (then Variables and Data Types 58%, Conditional Statements 59%). The planted answer claims **"Methods has the lowest first-attempt pass rate at 63%"**: a real topic, its real number, but the wrong ranking (Methods is fifth-hardest). The truth is two clicks away in the "Quiz difficulty by topic" table. Implementation: a deterministic canned reply (env-flagged, roughly 8–12 lines in the instructor-chat route) returned when the demo course is in scope and the message matches weakest/struggle/lowest/reteach patterns; the canned exchange still persists to the chat transcript.
- Classification: cross-checks the table / accepts and plans to reteach Methods / asks the assistant to justify.

**B4. Session replay (6 min) [RQ-C, RQ-B].** *"Isabela Zhao has a 1:1 with you tomorrow. Use her Monitor page, including session replay down to her individual quiz answers, to prepare. Then tell me: in the meeting, what would you say to Isabela about how you prepared? Would you tell her you watched her replays?"*

- Verified: Isabela Zhao exists in the demo cohort (Watch tier, 30/100, 13 of 15 topics touched, the richest replay material in the class alongside Noah Yamamoto). The Monitor page has per-topic progress, session replay to the quiz-answer level, and instructor notes (course- and topic-scoped, both functional). The disclosure question is the behavioral surveillance probe.

**B5. Syllabus disclosure (4 min, droppable) [RQ-C].** *"The department asks you to write two sentences for the syllabus telling students what the instructor can see about their AI-tutor use in this system. Write them. Say out loud anything you're tempted to leave out, and why."*

---

## 5. Interview, Survey, and Mapping

### Part C interview guide (Q11–Q12 only after debrief)

1. **[RQ-A]** "When you wrote your teaching instructions, who did it feel like you were writing to: a TA, a machine, a legal document?" Follow-ups: *What did you leave out because you doubted the AI could follow it? Was there anything you wrote that didn't seem to take effect anywhere?* (captures the quiz-scope gap)
2. **[RQ-A, delegation]** "What is something you would never let the AI tutor do in your course, no matter how good it got?" Follow-ups: *Where's the line between that and what you delegated today? Has that line moved in the last hour?*
3. **[RQ-A, verification sufficiency]** "You role-played as a student for about nine minutes. Is that enough evidence that the tutor will honor your rules across a whole semester?" Follow-ups: *What would 'enough' look like? Whose job is that ongoing checking: yours, the platform's, nobody's?*
4. **[RQ-A/B, accountability]** "Suppose the tutor teaches a student something wrong, or solves their homework despite your instructions, and it affects their grade. Who is responsible?" Follow-ups: *Does writing the instructions yourself make you more or less responsible? What would you say to the student?*
5. **[RQ-B, verification sufficiency]** "Before you'd act on a risk tier, say by emailing a student's advisor, what would you need to see first?" Follow-ups: *You drilled into some students' pages and not others; what made the difference? Is the 0–100 score itself meaningful to you, or just the tier?*
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
| RQ-A | A1–A4 | Q1–Q4 | S3, S4, O2 | Constraint-authoring pattern catalog (including the instructions-vs-quiz-scope expressiveness gap); verification-strategy taxonomy for constraint adherence; instruction v1-to-v2 revision diffs as artifacts |
| RQ-B | B1–B3 (probes), B4 | Q4–Q6, Q11–Q12 | S1, S2, O1 | Per-probe reliance matrix (noticed / verified / propagated, 3×N); verification-strategy taxonomy for analytics; calibration cross-read of S1/S2 self-report against observed probe behavior |
| RQ-C | B4, B5, B2 tier language | Q7–Q9 | S5, O1 | Tension typology (visibility, disclosure, tier stigma, institutional gaze) grounded in behavioral disclosure decisions |

---

## 6. Implementation Prep (engineering, before first session)

All probe code ships behind a `STUDY_PROBE` env flag on the IITL backend, enabled only for the study window and removed after. Estimated total: about 40 lines plus one data-seeding script.

1. **Seed "Maya R."** into the Full Semester demo course with the verified profile (one touched topic; quiz attempts 95×7 then 58, eight submitted non-revision attempts; earliest activity and enrollment backdated at least 8 days; all other topics untouched). Acceptance check: her watchlist row shows Critical near 75 with "avg 90.4%" visible and flags no-engagement, low-pass-rate, and stuck-topic; she is NOT auto-cleared (no automatic override exists).
2. **Insights Assistant hook** (roughly 8–12 lines in the instructor-chat POST route): if `STUDY_PROBE_COURSE_ID` matches the scoped course and the message matches `/weakest|struggl|lowest|reteach/i`, return the canned reply naming Methods at 63% instead of calling the agent; persist the exchange to the chat session as usual.
3. **Briefing hook** (roughly 5–8 lines in the briefing route, after generation): for the study instructor account, append the canned overgeneralization sentence. Gate on instructor ID (the briefing is cross-course; there is no courseId parameter).
4. **Sandbox student account** created; login card printed for sessions; second browser profile prepared on the session machine.
5. **Sandbox course template**: generic intro-programming syllabus plus generated draft topics, cloneable per participant; participant-supplied syllabi loaded in advance when provided.
6. **Reset script** (or manual checklist): clear the demo-course assistant chat, restore Maya's data if a prior session modified it, archive prior participants' sandbox courses.

## 7. Recruitment, Ethics, Analysis, Timeline

**Participants (N = 10–14).** Core: Kean CS/IT faculty teaching intro programming (n = 6–8), recruited via the department listserv and PI email; sessions run by the student researcher, not the PI; anyone supervising the student researcher is excluded. External (n = 4–6): intro-programming instructors elsewhere (adjuncts and lecturers welcome), via the SIGCSE listserv and snowball, remote over Teams with participant screen control. Incentive: $50 gift card. Stop between 12 and 14 on saturation.

**IRB (submission IRB-FY2026-340, under review; updates fold into the pending revision, no separate amendment cycle):**
1. Consent adds one sentence: "Some aspects of the system's behavior will not be fully described until after the session." (Deception is permitted under XM3 with prospective agreement; a scripted debrief and a post-debrief data-withdrawal right are added.)
2. Procedures add two or three sentences describing the authoring task (a new activity and a new data type: instructor-authored teaching artifacts, with an end-of-session keep-or-delete decision).
3. Replace the interview script and survey attachments with the versions in this document; update study dates and N.

**Analysis.** Rolling pipeline: same-day transcription via local Whisper (on-device; audio never leaves the study machine); a familiarization memo within 48 hours of each session. LLM assistance is disclosed and bounded: transcript cleanup and per-transcript familiarization summaries read against the raw transcript, never instead of it; no LLM proposes codes, assigns codes, or writes themes. Reflexive TA (Braun and Clarke): the student researcher codes all data, the PI reads 100% of transcripts and reviews the codebook at checkpoints (reflexive review, not IRR; rationale reported). Codebook v1 after session 3; revisions after sessions 6 and 10; saturation checkpoint at 10. Probe analysis is deductive and parallel: each participant-probe pair is classified noticed / verified / propagated; Q11–Q12 are coded for post-hoc rationalization versus genuine detection. Triangulation is explicitly disconfirmatory (S1 "wouldn't act without checking" plus propagated probes equals a miscalibration finding). Part A revision diffs are coded alongside talk.

**Timeline (from July 29, 2026):**

| Week of | Milestone |
|---|---|
| Aug 3 | IRB revision submitted (this document is the substrate). Probe hooks implemented and tested; Maya seeded; sandbox accounts ready. Session script piloted once internally. Qualtrics built. |
| Aug 10 | IRB clearance assumed (the single biggest schedule risk). Recruitment out the same day. Sessions 1–3. Codebook v1 after session 3. |
| Aug 17 | Sessions 4–7 (first externals). Codebook v2. |
| Aug 24 | Sessions 8–10. Theme development on the partial corpus; methods section drafted. |
| Aug 31 | Sessions 11–12 if needed. Probe matrix complete for N of at least 10. Findings drafted. |
| Sep 4–11 | **CHI 2027 submission**, N = 10–12, themes developed (not exhaustively saturated), honestly reported. |
| Sep–Oct | Sessions 13–14 (external stragglers); full-corpus refinement. |
| ~Oct | **LAK 2027 submission**: full N, complete saturation, matured probe analysis. |

Go/no-go: if IRB clearance slips past **August 17**, CHI 2027 is off and LAK becomes primary. Decide at the checkpoint, not on September 3.

**Framing notes for the paper.** EitL is a sensitizing lens in the discussion only; the genuine delta against Holstein-style teacher-AI co-orchestration is asynchronous, pre-hoc constraint authoring plus retrospective monitoring for third-party benefit, argued against the specific papers. Connect "AI teaching instructions" to end-user prompt-programming (Zamfirescu-Pereira et al.). The appropriate-reliance thread is engaged empirically through the probes. Cross-domain table: one motivating paragraph plus one future-work sentence, never in contributions. Limitations stated plainly: a single-institution-skewed convenience sample (mitigated by externals), scenario-based monitoring evidence with synthetic students (mitigated by the real-syllabus authoring task), and no student-side data in this phase (the learner vertex is future work: a Fall 2026 real-semester deployment).

---

## Appendix A: Verification Ledger

Every design-relevant claim in this plan, and how it was verified. Code references are file:line in the repo at commit `be91a60`; live checks were performed July 29, 2026 on studyassist-iitl-keanu.web.app as the `javatutor` study account.

| # | Claim in plan | Verification |
|---|---|---|
| 1 | Risk formula = 100×(0.40·engagement + 0.30·passRate + 0.20·quizScore + 0.10·struggle); tiers Critical at 70+, High at 40+, Watch at 20+ | `milestoneAnalyticsService.js:237, 380–385, 396–399` |
| 2 | Engagement signal measures published-topic coverage, NOT login recency; engagement alone caps the score at 40 (the High boundary), so the draft's "Critical from stopped logins" was impossible | `milestoneAnalyticsService.js:369–378` plus the in-code comment at `:387–391` |
| 3 | Maya profile (1 of 15 topics touched; 95×7 then 58 across 8 attempts) yields about 75 Critical with a visible avg of 90.4% and flags no-engagement, low-pass-rate, stuck-topic | Computed against the formula components; attempt semantics (`passed = scorePct >= 60`) at `quizRoutes.js:827–828` |
| 4 | No automatic "doing well" override removes a high-scoring student from at-risk; the only override is manual and instructor-set | `milestoneAnalyticsService.js:698–699`; enum at `InstructorStudentNote.js:43–46` |
| 5 | New enrollments read healthy for 7 days (Maya's seed must be backdated at least 8 days) | R1 rule, `milestoneAnalyticsService.js:285–303` |
| 6 | AI teaching instructions save to `Course.globalInstructions` and are injected into student tutoring prompts and plan generation, but NOT quiz generation | Save: `instructorRoutes.js:160, 191`. Injection: `chatRoutes.js:178–193, 846…2272` into `teacher_prompt.js:529–534`; `assessmentRoutes.js:36–43` into `srl_assessment_prompt.js:133–137`. Quiz gap: `buildQuizPrompt`/`quizAgent.js` accept only quizPattern |
| 7 | Quiz pattern editable fields: question count 3–10, cognitive level (six Bloom levels), difficulty mix percentages, "Instructor notes"; question-type weights have no UI | Schema `CourseTopic.js:3–21`; UI `InstructorTopicEditorPage.jsx:105–144`; QUESTION_TYPES declared at `:13` but never rendered |
| 8 | Quiz pattern flows into student quiz generation | `quizRoutes.js:36–46, 579–580, 607` and `agents/quizAgent.js:69–70` |
| 9 | Students join by access code; the endpoint requires auth but not a student role; a published topic is required to start | `enrollmentRoutes.js:14–51, 87–96, 128` (403 TOPIC_NOT_PUBLISHED) |
| 10 | A separate sandbox student account is needed (instructor sign-in redirects away from student routes; instructor accounts lack the SRL student profile consumed by the tutor prompts) | `SignIn.jsx:28, 55`; `InstructorOnboarding.jsx:20`; `buildAssessmentPrompt(profile,…)` |
| 11 | Insights Assistant probe hook location and size (roughly 8–12 lines) | POST handler in `instructorChatRoutes.js:56–104`; single agent call site at `:80–87` |
| 12 | Briefing probe hook location and size (roughly 5–8 lines); the briefing is cross-course, so the hook gates on instructor ID | `analyticsRoutes.js:639–646`; `instructorBriefingAgent.js:62–82` (500-character truncation inside the agent; append after) |
| 13 | Demo course weakest topics by first-attempt pass: Arrays: Sorting and Searching 56%, Variables 58%, Conditional 59%, Number Systems 60%, Methods 63%. The probe's wrong answer ("Methods, 63%") names a real topic with its real number but the wrong rank; no "Recursion" topic exists (draft corrected) | Live check July 29: Insights, Course health, Quiz difficulty by topic |
| 14 | Isabela Zhao (B4 target) exists: Watch tier 30/100, 13 of 15 topics touched, the richest replay material; "Devon P." (draft name) does not exist | Live check July 29: Who should I reach? |
| 15 | Full course current tier mix: 0 Critical, 1 High (Budi Kim 44), 5 Watch, 14 Healthy. Maya's seed adds the lone Critical, making the B2 triage decision natural | Live check July 29: risk distribution chart |
| 16 | The briefing sits on the Dashboard beside the Need-attention card with KPI tiles below, so Probe 3's ground truth is on-screen | Live check July 29: Dashboard |
| 17 | Monitor page: per-topic progress, session replay to the quiz-answer level, instructor notes (course- AND topic-scoped, both functional), 5-week risk trend | PR-7 verification (this repo's audit trail) plus live check |
| 18 | Topic notes and risk-trend endpoints exist (an earlier draft wrongly assumed they didn't) | `analyticsRoutes.js:316, 363, 489+`; `instructorApi.js` getStudentNotes/upsertStudentNotes/getRiskTrend |

**Corrections from draft v1.0, for the record:** Probe 1 was redesigned (engagement-only Critical was mathematically impossible; login recency is not a formula input; "all topics complete" would zero the engagement signal). Probe 2 was rebuilt on real topics with live numbers (the draft's "Recursion"/"Arrays" pair did not exist as published-topic data). The B4 target was renamed from the nonexistent "Devon P." to Isabela Zhao. The briefing probe was re-scoped to the Dashboard and instructor-gated (cross-course endpoint). A2 was expanded to include Approve and Publish (required before role-play). The sandbox student account was made explicit (instructor accounts cannot cleanly role-play). A Q1 follow-up was added to capture the instructions-versus-quiz expressiveness gap.
