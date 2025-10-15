# Bug Fix: State Block Leakage & UI Not Updating

## 🐛 Issues Identified

### **Issue 1: JSON Leaking in Chat**
**Symptom:** User saw partial state block in chat:
```
Please confirm this plan before we proceed.

```state
{"topic":"JavaScript","phase":"planning","plan":[{"id":"m1","title":"Introduction to JavaScript","description":"Learn basic syntax and data types","status":"in_progress","milestones":["Learn basic
```

**Root Cause:** 
- LLM was listing full plan (4 modules with details) in chat
- This used up most of the `max_tokens` budget (400 for planning phase)
- State block started but got **truncated** by max_tokens limit
- Backend couldn't find complete ` ```state...``` ` block → logged "No ```state block found"
- Frontend received response WITHOUT state stripped → showed partial JSON

### **Issue 2: UI Not Updating After Plan Created**
**Symptom:** Right panel didn't show the new plan

**Root Cause:**
- No state block parsed → session NOT updated with new plan
- Frontend's `fetchSRLState` called BUT session still had empty plan
- ModuleProgressPanel received `plan: []` → nothing to display

---

## ✅ Fixes Applied

### **Fix 1: Reduce Planning Phase Chat Output**
**File:** `backend/prompts/systemPrompt.js`

**Before:**
```javascript
phaseInstructions = `PLANNING PHASE:
- Display the complete learning plan in chat with clear structure (modules + milestones).
- Ask: "Here's your personalized learning plan (also visible in the right panel). Ready to begin, or would you like to modify anything?"
```

**After:**
```javascript
phaseInstructions = `PLANNING PHASE:
- Briefly acknowledge the plan is ready (1-2 sentences).
- Ask: "I've created your learning plan (visible in the right panel). Ready to begin?"
- DO NOT list all modules in chat (they're in the right panel).
- ALWAYS include the complete \`\`\`state block at the end.
```

**Effect:**
- LLM now says: "I've created a 4-module plan for JavaScript. Ready to begin?" (short!)
- Leaves plenty of tokens for the state block
- Plan details shown in **right panel only** (no duplication)

---

### **Fix 2: Detect & Complete Truncated State Blocks**
**File:** `backend/server.js`

**Added Logic:**
```javascript
// Check if state block is incomplete (truncated by max_tokens)
const hasIncompleteState = fullResponse.includes('```state') && 
                          !fullResponse.match(/```state\s*[\s\S]*?\s*```/);

if (hasIncompleteState) {
  console.log('⚠️ State block incomplete, requesting completion...');
  // Ask model to complete just the state block
  const completeStateResponse = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: 'Complete the following JSON state block. Return ONLY the complete ```state block with valid JSON.' },
      { role: 'user', content: fullResponse.substring(fullResponse.lastIndexOf('```state')) }
    ],
    model: 'llama-3.3-70b-versatile',
    max_tokens: 300,
    temperature: 0.3
  });
  
  const completedState = completeStateResponse.choices[0].message.content.trim();
  fullResponse = fullResponse.substring(0, fullResponse.lastIndexOf('```state')) + completedState;
  console.log('✅ State block completed');
}
```

**Effect:**
- If state block is started but not closed, triggers a **completion request**
- Model completes just the state JSON (≤300 tokens)
- Replaces incomplete block with complete one
- Parsing succeeds → session updated → UI shows plan ✅

---

## 🎯 Expected Behavior Now

### **Planning Phase Chat Output:**
```
I've created a 4-module learning plan for JavaScript focused on web development 
(visible in the right panel). Ready to begin?

```state
{"topic":"JavaScript","phase":"planning","plan":[
  {"id":"m1","title":"Introduction to JavaScript",...},
  {"id":"m2","title":"DOM Manipulation and Events",...},
  {"id":"m3","title":"JavaScript and HTML/CSS Integration",...},
  {"id":"m4","title":"Advanced JavaScript Concepts",...}
],"currentModuleId":null,"progress":{"overallPct":0,"modulePct":0},"nextAction":"ask"}
```
```

### **What User Sees:**
```
I've created a 4-module learning plan for JavaScript focused on web development 
(visible in the right panel). Ready to begin?
```
(State block stripped by frontend ✅)

### **Right Panel Shows:**
```
📋 JavaScript | PLANNING

Learning Path:
1. ● Introduction to JavaScript
   Learn basic syntax and data types
   • Learn basic syntax and data types
   • Understand variables, operators...
   • Complete a simple calculator project

2. 🔒 DOM Manipulation and Events
   (locked)

3. 🔒 JavaScript and HTML/CSS Integration
   (locked)

4. 🔒 Advanced JavaScript Concepts
   (locked)
```

---

## 🧪 Test Case

**Input:**
1. User: "I want to learn JavaScript"
2. User: "web development, don't have any experience, I prefer hands-on"

**Expected Logs:**
```
✅ Groq API response received
✅ Generated reply (142 tokens): I've created a 4-module learning plan...
✅ Parsed state: {
  topic: 'JavaScript',
  phase: 'planning',
  plan: [
    { id: 'm1', title: 'Introduction to JavaScript', ... },
    { id: 'm2', title: 'DOM Manipulation and Events', ... },
    ...
  ],
  ...
}
✅ Assistant message saved
```

**Expected Frontend:**
- Chat: "I've created a 4-module learning plan... Ready to begin?" (clean, no JSON)
- Right Panel: Shows 4 modules with milestones
- Phase badge: "PLANNING" (purple)

---

## 🔍 Prevention Measures

### **1. Max Tokens Budgeting**
- Planning phase: 400 tokens
- Must fit: greeting (50) + plan acknowledgment (50) + state block (250) = 350 tokens
- **Safety margin: 50 tokens**

### **2. Prompt Discipline**
- System prompt explicitly says: "DO NOT list all modules in chat"
- State block is mandatory: "ALWAYS include the complete ```state block"

### **3. Automatic Recovery**
- If state block truncated → auto-complete
- If completion fails → log warning, keep prior state
- **Never crash or show errors to user**

---

## 📝 Files Changed

1. ✅ `backend/prompts/systemPrompt.js` — Reduced planning phase verbosity
2. ✅ `backend/server.js` — Added incomplete state detection & completion

---

## 🚀 Status

✅ **Backend restarted** with fixes applied  
✅ **Frontend running** (no changes needed, already strips state blocks)  
✅ **Ready to test** — Try the same flow again!

---

## 💡 Key Takeaway

**Token budgeting is critical.** Even with max_tokens=400, if the model uses 300+ tokens for prose, the state block gets cut off. Solution: **Separate concerns** — prose in chat, data in state, plan in right panel.


