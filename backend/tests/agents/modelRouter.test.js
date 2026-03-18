describe('Model Router', () => {
  it('should return cheap model for intent task', () => {
    const { getModelForTask } = require('../../agents/framework/modelRouter');
    const model = getModelForTask('intent');
    expect(model).toBeDefined();
    expect(typeof model).toBe('string');
    expect(model).toMatch(/8b|instant/i);
  });

  it('should return expensive model for plan task', () => {
    const { getModelForTask } = require('../../agents/framework/modelRouter');
    const model = getModelForTask('plan');
    expect(model).toBeDefined();
    expect(typeof model).toBe('string');
    expect(model).toMatch(/70b|versatile/i);
  });

  it('should return expensive model for unknown task', () => {
    const { getModelForTask } = require('../../agents/framework/modelRouter');
    const model = getModelForTask('unknown_task');
    expect(model).toBeDefined();
    expect(model).toMatch(/70b|versatile/i);
  });
});
