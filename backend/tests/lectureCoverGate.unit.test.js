/**
 * B3 page-shape gate (2026-08-18): the "What should I cover in lecture?"
 * section is feature-gated OFF for study clone courses via the heatmap
 * payload, so the Insights page renders only "What stands out" + the topic
 * list — the shape the moderator protocol was written against. Neutral flag
 * name (features.lectureCover) so a participant inspecting network traffic
 * sees a feature flag, not a study marker.
 */
describe('lectureCover gate — source contracts', () => {
  const routes = require('fs').readFileSync(require.resolve('../routes/analyticsRoutes'), 'utf8');
  const prep = require('fs').readFileSync(require.resolve('../scripts/provisionStudyEnvironment'), 'utf8');

  it('heatmap route sets features.lectureCover=false ONLY for allowlisted study courses', () => {
    expect(routes).toMatch(/STUDY_PROBE_ENABLED && STUDY_PROBE_COURSE_SET\.has\(String\(req\.params\.courseId\)\)/);
    expect(routes).toMatch(/features: \{ lectureCover: false \}/);
    // exactly one flag site — the gate must not leak into other endpoints
    expect(routes.match(/lectureCover/g)).toHaveLength(1);
  });

  it('the course allowlist comes from the same env the probes use', () => {
    expect(routes).toMatch(/STUDY_PROBE_COURSE_SET = new Set\(\s*\n\s*String\(process\.env\.STUDY_PROBE_COURSES/);
  });

  it('prep-session asserts the gate live and NO-GOes without it', () => {
    expect(prep).toMatch(/Insights "What should I cover in lecture\?" is OFF on the clone/);
    expect(prep).toMatch(/hm\?\.features\?\.lectureCover === false/);
    expect(prep).toMatch(/GATE MISSING/);
  });

  it('the frontend hides the WHOLE section on the flag (not just its rows)', () => {
    const page = require('fs').readFileSync(
      require.resolve('../../frontend/my-app/src/Pages/instructor/InstructorInsightsPage.jsx'), 'utf8');
    expect(page).toMatch(/heatmap\?\.features\?\.lectureCover !== false && \(/);
    // "What stands out" is untouched — still rendered unconditionally
    expect(page).toMatch(/<h2 className="text-base font-bold text-ink-900">What stands out<\/h2>/);
  });
});
