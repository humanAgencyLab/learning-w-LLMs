# Stage Assessment Rubric

This document defines the criteria for automatically assessing a learner's stage based on their messages and conversation history.

## Assessment Criteria

### Stage 1: Unconscious Incompetence
**Indicators:**
- Uses vague or incorrect terminology
- Asks basic "what is" questions
- Shows confusion about fundamental concepts
- Uses phrases like "I don't understand", "I'm confused", "What does this mean?"
- Makes basic conceptual errors
- Needs constant guidance and explanation

**Confidence Threshold:** 0.7
**Keywords:** "what is", "I don't know", "confused", "explain", "help me understand"

### Stage 2: Conscious Incompetence
**Indicators:**
- Knows basic terminology but struggles with application
- Can define concepts but can't use them effectively
- Asks "how to" questions
- Shows understanding of basics but makes application errors
- Needs step-by-step guidance
- Shows some confidence but still requires support

**Confidence Threshold:** 0.7
**Keywords:** "how to", "I know that but", "I understand but", "can you show me"

### Stage 3: Conscious Competence
**Indicators:**
- Uses correct terminology consistently
- Can work through problems with effort
- Asks advanced questions about implementation or optimization
- Shows logical reasoning process
- Can explain their thinking
- Demonstrates growing independence

**Confidence Threshold:** 0.7
**Keywords:** "I think", "let me try", "I would approach this", "what if", "optimize"

### Stage 4: Unconscious Competence
**Indicators:**
- Fluent use of advanced terminology
- Asks creative or synthesis questions
- Can solve complex problems independently
- Offers insights or alternative approaches
- Can teach or explain to others
- Shows mastery and confidence

**Confidence Threshold:** 0.8
**Keywords:** "I can", "let me show you", "another approach", "what about", "consider"

## Assessment Process

1. **Analyze Message Content:**
   - Look for stage-specific keywords and phrases
   - Assess complexity of questions and statements
   - Evaluate use of terminology
   - Check for conceptual understanding

2. **Consider Conversation History:**
   - Look for progression patterns
   - Assess consistency of understanding
   - Check for repeated mistakes or breakthroughs

3. **Calculate Confidence:**
   - Count matching indicators
   - Weight by message complexity
   - Consider conversation length and depth
   - Factor in topic-specific knowledge

4. **Generate Rationale:**
   - Explain which indicators were found
   - Note specific phrases or patterns
   - Suggest areas for improvement
   - Recommend next steps

## Special Cases

- **Mixed Signals:** If indicators point to different stages, choose the lower stage with lower confidence
- **Very Short Messages:** Require higher confidence threshold (0.8+)
- **Off-topic Messages:** Ignore for assessment purposes
- **Test Mode:** If user explicitly asks for assessment, be more generous with stage advancement

## Confidence Levels

- **0.9-1.0:** Very confident assessment
- **0.7-0.9:** Confident assessment
- **0.5-0.7:** Uncertain assessment
- **0.0-0.5:** Very uncertain assessment

## Rationale Examples

**Stage 1 Example:**
"User shows clear signs of Stage 1: asks 'what is machine learning' and 'I don't understand how it works'. Uses no technical terminology and needs basic explanations. High confidence (0.9) based on multiple indicators."

**Stage 3 Example:**
"User demonstrates Stage 3 competence: uses correct terminology like 'backpropagation' and 'gradient descent', asks 'how can I optimize this algorithm', and shows logical problem-solving approach. Confident assessment (0.8) based on advanced questions and correct usage."

**Stage 4 Example:**
"User shows mastery level: proposes alternative approaches, asks synthesis questions like 'how does this relate to reinforcement learning', and offers to explain concepts to others. Very confident (0.9) based on teaching-level understanding and creative thinking."



