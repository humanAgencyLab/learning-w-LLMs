describe('Agent Validators', () => {
  describe('IntentValidator', () => {
    const { validateIntent } = require('../../agents/validators/intentValidator');

    it('should accept valid learning intent', () => {
      const result = validateIntent({
        intent: 'learning',
        action: 'trigger_assessment',
        topic: 'Python basics',
        response: '',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject learning intent without topic', () => {
      const result = validateIntent({
        intent: 'learning',
        action: 'trigger_assessment',
        topic: '',
        response: '',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('topic'))).toBe(true);
    });

    it('should reject invalid intent', () => {
      const result = validateIntent({
        intent: 'invalid',
        action: 'trigger_assessment',
        topic: 'Python',
        response: '',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('PlanValidator', () => {
    const { validatePlan } = require('../../agents/validators/planValidator');

    it('should accept valid 2-module plan', () => {
      const result = validatePlan({
        topic: 'Python',
        plan: [
          { moduleId: '1', title: 'Intro', targets: ['A', 'B', 'C'], points: 50 },
          { moduleId: '2', title: 'Advanced', targets: ['D', 'E', 'F'], points: 50 },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('should reject plan with too few modules', () => {
      const result = validatePlan({
        topic: 'Python',
        plan: [{ moduleId: '1', title: 'Only', targets: ['A', 'B', 'C'], points: 100 }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('AssessmentValidator', () => {
    const { validateAssessment } = require('../../agents/validators/assessmentValidator');

    it('should accept valid correct_answer', () => {
      const result = validateAssessment({
        responseType: 'correct_answer',
        understood: true,
        recommendation: 'move_forward',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject correct_answer with understood=false', () => {
      const result = validateAssessment({
        responseType: 'correct_answer',
        understood: false,
        recommendation: 'move_forward',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('TeachingValidator', () => {
    const { validateTeaching } = require('../../agents/validators/teachingValidator');

    it('should accept content with 100 words and 1 question', () => {
      const content = Array(100).fill('word').join(' ') + ' What is the answer?';
      const result = validateTeaching({ content });
      expect(result.valid).toBe(true);
    });

    it('should reject content with no question', () => {
      const content = Array(100).fill('word').join(' ');
      const result = validateTeaching({ content });
      expect(result.valid).toBe(false);
    });
  });

  describe('QuizValidator', () => {
    const { validateQuiz } = require('../../agents/validators/quizValidator');

    it('should accept valid 5-question quiz', () => {
      const result = validateQuiz({
        questions: Array(5).fill(null).map((_, i) => ({
          id: `q${i + 1}`,
          text: 'Question?',
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 0,
          explanation: 'Because.',
        })),
      });
      expect(result.valid).toBe(true);
    });

    it('should reject quiz with forbidden options', () => {
      const result = validateQuiz({
        questions: [{
          id: 'q1',
          text: 'Question?',
          options: ['A', 'B', 'C', 'All of the above'],
          correctIndex: 0,
          explanation: 'Because.',
        }],
      });
      expect(result.valid).toBe(false);
    });
  });
});
