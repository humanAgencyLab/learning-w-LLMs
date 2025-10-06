const Groq = require('groq-sdk');

const generateQuiz = async (topic, stage, sessionHistory = []) => {
  const stageDescriptions = {
    1: "basic concepts and definitions",
    2: "practical applications and common patterns", 
    3: "advanced problem-solving and deeper understanding",
    4: "creative applications and synthesis of concepts"
  };

  const prompt = `Generate a quiz for someone learning about "${topic}" at Stage ${stage} (${stageDescriptions[stage]}).

Based on this conversation history, create 5-8 multiple choice questions that test their understanding at this stage:
${sessionHistory.map(msg => `${msg.isUser ? 'User' : 'Assistant'}: ${msg.message}`).join('\n')}

Requirements:
- Questions should be appropriate for Stage ${stage} level
- Each question should have 4 options (A, B, C, D)
- Include one correct answer and 3 plausible distractors
- Provide brief explanations for each answer
- Focus on practical understanding, not just memorization
- Make questions progressively more challenging

Return as JSON in this exact format:
{
  "questions": [
    {
      "question": "What is...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}`;

  try {
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert quiz generator. Create educational quizzes that test understanding at appropriate difficulty levels. Always return valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    const content = response.choices[0].message.content.trim();
    
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No valid JSON found in response');
    }
  } catch (error) {
    console.error('Quiz generation error:', error);
    
    // Fallback to basic quiz
    return {
      questions: [
        {
          question: `What is the main concept of ${topic}?`,
          options: [
            "A fundamental principle",
            "An advanced technique", 
            "A simple method",
            "A complex theory"
          ],
          correctAnswer: 0,
          explanation: "This tests basic understanding of the topic."
        },
        {
          question: `Which of the following best describes ${topic}?`,
          options: [
            "Easy to understand",
            "Requires practice",
            "Very difficult",
            "Impossible to learn"
          ],
          correctAnswer: 1,
          explanation: "This assesses practical understanding."
        }
      ]
    };
  }
};

module.exports = { generateQuiz };
