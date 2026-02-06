# Interactive Video Tutorial Script — AI Study Assistant  
**Target length: 2–3 minutes**  
**Use with:** Pause-and-try flow · Checkpoints · In-app **Tutorial** (left nav) or open `/video-tutorial-interactive.html` when the app is running.

---

## How to Use This Script (Interactive)

- **PAUSE & TRY** — Pause the video and complete the step yourself. Resume when done.
- **CHECKPOINT** — Verify you’re on track. Choose "Done" → continue; "Stuck" → rewatch or use the in-app tutorial.
- **YOUR TURN** — Same as Pause & Try; emphasis on you doing the action.
- **Copy** — Use "Copy narrator line" in the interactive HTML (`/video-tutorial-interactive.html`) when recording voiceover.

---

## Overview

| Section | Duration | Interactive? |
|--------|----------|--------------|
| 1. Intro | ~10 s | Watch only |
| 2. Registration & Login | ~35 s | **PAUSE & TRY** + **CHECKPOINT** |
| 3. Create & Modify Plan | ~50 s | **PAUSE & TRY** + **YOUR TURN** |
| 4. Learning (2 modules) | ~55 s | **PAUSE & TRY** + **CHECKPOINT** |
| 5. Certificate | ~15 s | **YOUR TURN** |
| **Total** | **~2 min 45 s** | |

---

## Section 1 — Intro (≈10 s)

**On screen:** App logo / splash or home.

**Narrator:**
> "This is the AI Study Assistant. You pick a topic, get a personalized learning plan, work through modules with an AI tutor, take quizzes, and earn a certificate when you finish."

**Action:** Watch only. No interaction.

---

## Section 2 — Registration & Login (≈35 s)

### 2a. Sign up (≈15 s)

**On screen:** Navigate to **Sign up** (or `/signup`).

**Narrator (live walkthrough — say as you do each action):**
> "Let's create an account. The display name can be your real name or a pseudonym — it'll appear on your certificate. Here I'm putting **John Doe**."
> *[Type in Name field.]*
> "Let's generate the username."
> *[Click **Generate a Username**.]*
> "For password, I'm using an alphanumeric combination, eight characters long, as required."
> *[Type e.g. **Pass1234**.]*
> "And I'll click **Sign Up**."
> *[Click **Sign Up**.]*

---

**PAUSE & TRY**

- [ ] Enter **Name** (e.g. "John Doe") — real name or pseudonym; it appears on the certificate.
- [ ] Click **Generate a Username** (or type your own).
- [ ] Enter **Password** — alphanumeric, at least 8 characters.
- [ ] Click **Sign Up**.

**Resume** when you’ve signed up.

---

### 2b. Onboarding (≈12 s)

**On screen:** Onboarding — Step 1 of 2.

**Narrator (live walkthrough):**
> "Next, quick onboarding. I'll pick my major — say, Computer Science — add a topic I want to study, like **React Hooks**, and set my self-rating to **Intermediate**. Then **Next**."
> *[Fill Step 1, click **Next**.]*
> "On step two, I'll set my goal and how much time I have — for example, three days a week, forty minutes per session. Then **Complete**."
> *[Fill Step 2, click **Complete**.]*
> "And we're in the chat."

---

**YOUR TURN**

- [ ] **Step 1:** Major, **Topic of interest**, **Self-rating** → **Next**.
- [ ] **Step 2:** **Goal**, **Schedule** (e.g. 3 days/week, 40 min/session) → **Complete**.

**Resume** when you’ve landed on **Chat** (`/chat`).

---

### 2c. Sign in — returning user (≈8 s)

**On screen:** Sign out, then go to **Sign in** (`/signin`).

**Narrator (live walkthrough):**
> "If you're coming back, just sign in with your username and password. I'll enter mine and click **Sign In** — and we're straight into the chat."

---

**PAUSE & TRY**

- [ ] Enter **Username** and **Password**.
- [ ] Click **Sign In** → you should land on **Chat**.

**CHECKPOINT:** Did you reach the Chat page?  
- **Done** → Continue to Section 3.  
- **Stuck** → Rewatch 2a–2c or use the **Tutorial** in the app (left nav).

---

## Section 3 — Create & Modify Plan (≈50 s)

### 3a. Start a study session (≈10 s)

**On screen:** Chat page. "What you want to learn/study...". **Studying** mode selected.

**Narrator:**
> "From the chat, choose Studying, type what you want to learn, and send."

---

**YOUR TURN**

- [ ] Ensure **Studying** is selected (not Revision).
- [ ] Type a topic, e.g. **"React Hooks basics"** or **"Binary search"**.
- [ ] Click **Send** (or press Enter).

**Resume** when the **Learning Plan** with modules has appeared.

---

### 3b. Review the plan (≈15 s)

**Narrator:**
> "The assistant creates a learning plan: a list of modules, each with milestones. Expand a module to see its objectives."

---

**PAUSE & TRY**

- [ ] Scroll through the plan. Note **module count**, **points**, **difficulty**.
- [ ] Expand **Module 1** (and optionally **Module 2**) to see **Learning objectives** / milestones.

**Resume** when you’ve looked at the plan.

---

### 3c. Request a modification (≈15 s)

**Narrator:**
> "You can approve the plan as is, or request changes—for example, limit it to two modules, or make it more beginner-friendly."

---

**YOUR TURN**

- [ ] Scroll to **Request Modifications**.
- [ ] Either click a **quick chip** (e.g. **"Make it more beginner-friendly"** or **"Reduce milestones"**) **or** type e.g. **"Keep it to exactly 2 modules"**.
- [ ] Click **Request Modification**.
- [ ] Wait for the plan to update, then briefly check the new plan.

**Resume** when the plan has been updated.

---

### 3d. Approve the plan (≈10 s)

**Narrator:**
> "When you’re happy with it, click **Approve this Learning Plan** to start Module 1."

---

**PAUSE & TRY**

- [ ] Click **Approve this Learning Plan**.
- [ ] Confirm you’re in the **learning** view (chat with the AI).

**CHECKPOINT:** Are you in the learning chat?  
- **Done** → Continue to Section 4.  
- **Stuck** → Rewatch 3a–3d or use the **Tutorial** in the app.

---

## Section 4 — Learning Process (2 Modules) (≈55 s)

### 4a. Module 1 — Learn & quiz (≈30 s)

**Narrator:**
> "The AI teaches one milestone at a time. You read, answer check questions, and move on. When you’ve finished all milestones in a module, you’ll see **Start Quiz**."

---

**YOUR TURN**

- [ ] Scroll through **1–2 assistant messages** (teaching + a question).
- [ ] Send **your reply** (short answer or a chip like **"Ready"** if shown).
- [ ] Keep going until **Start Quiz** appears, then click **Start Quiz**.

**On screen:** Quiz overlay.

**Narrator:**
> "Answer the quiz questions. When you pass, you get feedback and can continue to the next module."

---

**PAUSE & TRY**

- [ ] Answer **1–2 questions** (use correct answers for a smooth demo).
- [ ] Submit the quiz. See **feedback**.
- [ ] Click **Continue to Next Module** (or equivalent).

**Resume** when you’ve moved to Module 2.

---

### 4b. Module 2 — Learn & quiz (≈25 s)

**Narrator:**
> "Module 2 works the same way: learn the material, finish the milestones, then take the module quiz."

---

**YOUR TURN**

- [ ] Do **Module 2** (briefly show one exchange, then complete milestones or fast‑forward).
- [ ] Click **Start Quiz** for Module 2.
- [ ] Answer and submit. Check **feedback** and **passed** state.
- [ ] When both modules are done, you should see the **completed** view (e.g. confetti or completion message).

**CHECKPOINT:** Have you completed both modules?  
- **Done** → Continue to Section 5.  
- **Stuck** → Rewatch 4a–4b or use the **Tutorial** in the app.

---

## Section 5 — Certificate (≈15 s)

**On screen:** Completion / quiz feedback with **Generate your certificate** (or similar).

**Narrator:**
> "After completing all modules, you can generate your certificate. It downloads as a PDF with your name and the topic."

---

**YOUR TURN**

- [ ] Click **Generate your certificate** (or **Generate certificate**).
- [ ] Confirm the **PDF** downloads (or a success state).
- [ ] Optional: Open **Profile** → **Certificates** and show the new certificate.

**Narrator (optional closer):**
> "You can view and download your certificates anytime from your Profile."

---

## Interactive Checklist (for recording or follow‑along)

- [ ] **Intro** — App name + what it does (≈10 s)
- [ ] **Sign up** — Name, username, password (≈15 s)
- [ ] **Onboarding** — Step 1 → Step 2 → Chat (≈12 s)
- [ ] **Sign in** (optional) — Username, password → Chat (≈8 s)
- [ ] **Create plan** — Enter topic → Send → Plan appears (≈10 s)
- [ ] **Review plan** — Scroll, expand modules (≈15 s)
- [ ] **Modify plan** — Chip or custom request → Request Modification (≈15 s)
- [ ] **Approve plan** — Approve this Learning Plan (≈10 s)
- [ ] **Module 1** — Learn → Start Quiz → Pass → Continue (≈30 s)
- [ ] **Module 2** — Learn → Start Quiz → Pass → Complete (≈25 s)
- [ ] **Certificate** — Generate → Download (→ Profile) (≈15 s)

**Total:** ~2 min 45 s (trim or extend as needed).

---

## Links for Interactive Use

| Step | Deep link |
|------|-----------|
| Sign up | `/signup` |
| Sign in | `/signin` |
| Onboarding | `/onboarding` |
| Chat | `/chat` |
| Profile → Certificates | `/profile` (then scroll to Certificates) |

Use these in the interactive HTML (`/video-tutorial-interactive.html`) or in-app **Tutorial** (left nav) to jump to the right place.

---

*Script last updated for the AI Study Assistant app. Use with the interactive tutorial in the app or the standalone HTML for a fully interactive experience.*
