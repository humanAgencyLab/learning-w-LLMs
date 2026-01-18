// Utility to parse and detect question types from message content

export const detectQuestionType = (content) => {
  const lowerContent = content.toLowerCase().trim();
  
  // Check for True/False questions
  if (lowerContent.includes('true or false') || lowerContent.match(/^.*true or false:/i)) {
    return 'true-false';
  }
  
  // Check for Multiple Choice Questions (format: A), B), C), D) or a), b), c), d))
  const mcqPattern = /[a-d]\)\s+[^\n]+/i;
  const lines = content.split('\n');
  const hasMCQOptions = lines.some(line => mcqPattern.test(line.trim()));
  
  if (hasMCQOptions) {
    return 'multiple-choice';
  }
  
  // Default to text-based question
  return 'text';
};

export const parseMCQQuestion = (content) => {
  const lines = content.split('\n').filter(l => l.trim());
  const questionLine = lines[0] || '';
  const options = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    const optionMatch = line.match(/^([a-d])\)\s+(.+)$/i);
    if (optionMatch) {
      options.push({
        letter: optionMatch[1].toUpperCase(),
        text: optionMatch[2]
      });
    }
  }
  
  return {
    question: questionLine,
    options: options
  };
};
