// Pre-built response templates to reduce token usage
const responseTemplates = {
  assessment: {
    piano: {
      beginner: "Great! Let's start with piano basics. What do you want to achieve - playing for fun, performing, or learning theory?",
      intermediate: "Nice! What specific area would you like to focus on - technique, repertoire, or theory?",
      advanced: "Excellent! What advanced skills are you looking to develop?"
    },
    python: {
      beginner: "Perfect! Python is great for beginners. What do you want to build - web apps, data analysis, or automation?",
      intermediate: "Great! What specific Python area interests you - web development, data science, or AI/ML?",
      advanced: "Excellent! What advanced Python concepts are you exploring?"
    }
  },
  
  planOverview: (topic, modules) => {
    return `Plan overview — Topic: ${topic}, Phase: assessment → learning\n\n${modules.map((m, i) => `${i+1}. ${m.title} (${m.status})`).join('\n')}`;
  },
  
  microExercise: {
    piano: [
      "Sit at your piano. Find middle C (white key just left of the two black keys). Play it 5 times with your right thumb.",
      "Place your right hand on C-D-E-F-G. Play each note once, slowly. Feel the key resistance.",
      "Play C-E-G together (C major chord). Hold for 3 seconds, then release."
    ],
    python: [
      "Open Python. Type: print('Hello, World!') and press Enter.",
      "Create a variable: name = 'Your Name', then print it.",
      "Write: for i in range(3): print(i). Run it and see what happens."
    ]
  },
  
  quizFeedback: {
    pass: "Excellent! You've mastered this module. Moving to the next one...",
    fail: "Good effort! Let's review the key concepts and try again."
  }
};

module.exports = { responseTemplates };
