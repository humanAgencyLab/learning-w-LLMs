// Temporary hard-coded user profile data
// This will be replaced by real authentication data later
export const HARDCODED_PROFILE = {
  name: 'Demo User',
  education: 'BSc CS, Year 2',
  recentCourses: ['Python Basics', 'Data Structures'],
  strengths: ['variables', 'loops'],
  gaps: ['file I/O', 'OS basics'],
  goals: ['interview prep in 4 weeks'],
  preferredDepth: 'concise-but-complete',
  gems: 0,
};

// Helper functions for working with user profile
export const getUserDisplayName = () => HARDCODED_PROFILE.name;

export const getUserEducation = () => HARDCODED_PROFILE.education;

export const getRecentCourses = () => HARDCODED_PROFILE.recentCourses;

export const getStrengths = () => HARDCODED_PROFILE.strengths;

export const getGaps = () => HARDCODED_PROFILE.gaps;

export const getGoals = () => HARDCODED_PROFILE.goals;

export const getPreferredDepth = () => HARDCODED_PROFILE.preferredDepth;

// Profile summary for display
export const getProfileSummary = () => ({
  name: HARDCODED_PROFILE.name,
  education: HARDCODED_PROFILE.education,
  courseCount: HARDCODED_PROFILE.recentCourses.length,
  strengthCount: HARDCODED_PROFILE.strengths.length,
  gapCount: HARDCODED_PROFILE.gaps.length,
  goalCount: HARDCODED_PROFILE.goals.length,
});
