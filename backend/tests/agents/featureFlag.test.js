describe('Feature Flag', () => {
  const originalEnv = process.env.USE_MULTI_AGENT;

  afterEach(() => {
    process.env.USE_MULTI_AGENT = originalEnv;
  });

  it('should return false when USE_MULTI_AGENT is unset', () => {
    delete process.env.USE_MULTI_AGENT;
    jest.resetModules();
    const { useMultiAgent } = require('../../agents/framework/featureFlag');
    expect(useMultiAgent()).toBe(false);
  });

  it('should return false when USE_MULTI_AGENT is "false"', () => {
    process.env.USE_MULTI_AGENT = 'false';
    jest.resetModules();
    const { useMultiAgent } = require('../../agents/framework/featureFlag');
    expect(useMultiAgent()).toBe(false);
  });

  it('should return true when USE_MULTI_AGENT is "true"', () => {
    process.env.USE_MULTI_AGENT = 'true';
    jest.resetModules();
    const { useMultiAgent } = require('../../agents/framework/featureFlag');
    expect(useMultiAgent()).toBe(true);
  });
});
