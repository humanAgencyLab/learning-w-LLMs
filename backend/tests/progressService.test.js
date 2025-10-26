const { updateProgress } = require('../services/progressService');

describe('Progress Service', () => {
  let mockSession;

  beforeEach(() => {
    mockSession = {
      _id: 'test-session-id',
      points: 0,
      gems: 0,
      isViewOnly: false,
      phase: 'learning',
      plan: [
        {
          id: '1',
          title: 'Module 1',
          status: 'in_progress',
          points: 30
        },
        {
          id: '2',
          title: 'Module 2',
          status: 'locked',
          points: 40
        },
        {
          id: '3',
          title: 'Module 3',
          status: 'locked',
          points: 30
        }
      ]
    };
  });

  describe('Basic functionality', () => {
    it('should add points and calculate gems correctly', () => {
      const result = updateProgress(mockSession, { 
        moduleId: '1', 
        pointsDelta: 30 
      });

      expect(result.points).toBe(30);
      expect(result.gems).toBe(1); // floor(30/20) = 1
      expect(result.isViewOnly).toBe(false);
      expect(result.completed).toBe(false);
      expect(result.phaseChanged).toBe(false);
    });

    it('should clamp points to 100 maximum', () => {
      mockSession.points = 80;
      
      const result = updateProgress(mockSession, { 
        moduleId: '1', 
        pointsDelta: 50 
      });

      expect(result.points).toBe(100);
      expect(result.gems).toBe(5); // floor(100/20) = 5
    });

    it('should clamp points to 0 minimum', () => {
      mockSession.points = 10;
      
      const result = updateProgress(mockSession, { 
        moduleId: '1', 
        pointsDelta: -20 
      });

      expect(result.points).toBe(0);
      expect(result.gems).toBe(0);
    });
  });

  describe('Idempotency', () => {
    it('should not award points for already passed module', () => {
      // Mark module as passed
      mockSession.plan[0].status = 'passed';
      mockSession.points = 30;
      
      const result = updateProgress(mockSession, { 
        moduleId: '1', 
        pointsDelta: 30 
      });

      expect(result.points).toBe(30); // No change
      expect(result.gems).toBe(1);
    });

    it('should be deterministic with same inputs', () => {
      // Create a fresh session for each call to avoid state modification
      const session1 = JSON.parse(JSON.stringify(mockSession));
      const session2 = JSON.parse(JSON.stringify(mockSession));
      
      const result1 = updateProgress(session1, { 
        moduleId: '1', 
        pointsDelta: 30 
      });
      
      const result2 = updateProgress(session2, { 
        moduleId: '1', 
        pointsDelta: 30 
      });

      expect(result1).toEqual(result2);
    });
  });

  describe('Completion detection', () => {
    it('should mark as completed when all modules are passed', () => {
      // Mark all modules as passed
      mockSession.plan.forEach(module => {
        module.status = 'passed';
      });
      
      const result = updateProgress(mockSession, { 
        moduleId: '3', 
        pointsDelta: 30 
      });

      expect(result.completed).toBe(true);
      expect(result.isViewOnly).toBe(true);
      expect(result.phaseChanged).toBe(true);
      expect(mockSession.phase).toBe('completed');
    });

    it('should not complete if not all modules are passed', () => {
      // Mark only first two modules as passed
      mockSession.plan[0].status = 'passed';
      mockSession.plan[1].status = 'passed';
      mockSession.plan[2].status = 'locked';
      
      const result = updateProgress(mockSession, { 
        moduleId: '2', 
        pointsDelta: 40 
      });

      expect(result.completed).toBe(false);
      expect(result.isViewOnly).toBe(false);
      expect(result.phaseChanged).toBe(false);
    });

    it('should not overwrite completed phase', () => {
      // Mark all modules as passed and set phase to completed
      mockSession.plan.forEach(module => {
        module.status = 'passed';
      });
      mockSession.phase = 'completed';
      mockSession.isViewOnly = true;
      
      const result = updateProgress(mockSession, { 
        moduleId: '1', 
        pointsDelta: 0 
      });

      expect(result.completed).toBe(true);
      expect(result.phaseChanged).toBe(false); // Already completed
      expect(mockSession.phase).toBe('completed');
    });
  });

  describe('Force recalculation', () => {
    it('should recalculate points from passed modules', () => {
      // Mark modules as passed but session has wrong points
      mockSession.plan[0].status = 'passed';
      mockSession.plan[1].status = 'passed';
      mockSession.points = 10; // Wrong value
      
      const result = updateProgress(mockSession, { 
        forceRecalc: true 
      });

      expect(result.points).toBe(70); // 30 + 40
      expect(result.gems).toBe(3); // floor(70/20) = 3
    });

    it('should handle invalid module points in plan', () => {
      // Add module with invalid points
      mockSession.plan.push({
        id: '4',
        title: 'Invalid Module',
        status: 'passed',
        points: 'invalid'
      });
      
      mockSession.plan[0].status = 'passed';
      mockSession.plan[1].status = 'passed';
      
      const result = updateProgress(mockSession, { 
        forceRecalc: true 
      });

      expect(result.points).toBe(70); // Only valid modules counted
    });
  });

  describe('Validation', () => {
    it('should throw error for invalid moduleId', () => {
      expect(() => {
        updateProgress(mockSession, { 
          moduleId: 'nonexistent', 
          pointsDelta: 30 
        });
      }).toThrow('Module nonexistent not found in session plan');
    });

    it('should throw error for module with invalid points', () => {
      mockSession.plan[0].points = 'invalid';
      
      expect(() => {
        updateProgress(mockSession, { 
          moduleId: '1', 
          pointsDelta: 30 
        });
      }).toThrow('Module 1 has invalid points: invalid');
    });

    it('should throw error for module with zero points', () => {
      mockSession.plan[0].points = 0;
      
      expect(() => {
        updateProgress(mockSession, { 
          moduleId: '1', 
          pointsDelta: 30 
        });
      }).toThrow('Module 1 has invalid points: 0');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty plan', () => {
      mockSession.plan = [];
      
      const result = updateProgress(mockSession, { 
        forceRecalc: true 
      });

      expect(result.points).toBe(0);
      expect(result.gems).toBe(0);
      expect(result.completed).toBe(true); // Empty plan = all passed
    });

    it('should handle plan with no points', () => {
      mockSession.plan.forEach(module => {
        module.points = 0;
      });
      
      const result = updateProgress(mockSession, { 
        forceRecalc: true 
      });

      expect(result.points).toBe(0);
      expect(result.gems).toBe(0);
    });

    it('should handle negative pointsDelta', () => {
      mockSession.points = 50;
      
      const result = updateProgress(mockSession, { 
        moduleId: '1', 
        pointsDelta: -20 
      });

      expect(result.points).toBe(30);
      expect(result.gems).toBe(1);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle multiple modules progression', () => {
      // First module pass
      let result = updateProgress(mockSession, { 
        moduleId: '1', 
        pointsDelta: 30 
      });
      expect(result.points).toBe(30);
      expect(result.completed).toBe(false);

      // Mark first module as passed
      mockSession.plan[0].status = 'passed';
      mockSession.plan[1].status = 'in_progress';

      // Second module pass
      result = updateProgress(mockSession, { 
        moduleId: '2', 
        pointsDelta: 40 
      });
      expect(result.points).toBe(70);
      expect(result.completed).toBe(false);

      // Mark second module as passed
      mockSession.plan[1].status = 'passed';
      mockSession.plan[2].status = 'in_progress';

      // Third module pass - should complete
      result = updateProgress(mockSession, { 
        moduleId: '3', 
        pointsDelta: 30 
      });
      
      // Mark third module as passed to trigger completion
      mockSession.plan[2].status = 'passed';
      
      // Call updateProgress again to check completion
      result = updateProgress(mockSession, { 
        moduleId: '3', 
        pointsDelta: 0 
      });
      
      expect(result.points).toBe(100);
      expect(result.completed).toBe(true);
      expect(result.isViewOnly).toBe(true);
    });

    it('should prevent phase overwrite bug', () => {
      // Simulate the bug: updateProgress sets completed, then caller tries to set feedback
      mockSession.plan.forEach(module => {
        module.status = 'passed';
      });
      
      // First call sets completed
      const result = updateProgress(mockSession, { 
        moduleId: '3', 
        pointsDelta: 30 
      });
      
      expect(result.completed).toBe(true);
      expect(mockSession.phase).toBe('completed');
      
      // Simulate caller trying to set feedback after completion
      if (!result.completed) {
        mockSession.phase = 'feedback';
      }
      
      // Should remain completed
      expect(mockSession.phase).toBe('completed');
    });
  });
});
