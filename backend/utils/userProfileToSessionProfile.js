/**
 * Convert user profile to session profile format (Session model requirements).
 * @param {import('mongoose').Document} user
 */
function userProfileToSessionProfile(user) {
  const profile = user.profile || {};

  return {
    source: 'user',
    name: user.name || 'User',
    background: profile.background || 'Student learning with AI assistance',
    goals: Array.isArray(profile.goals) ? profile.goals : [],
    strengths: Array.isArray(profile.strengths) ? profile.strengths : [],
    gaps: Array.isArray(profile.gaps) ? profile.gaps : [],
    timePerDayMins: profile.timePerDayMins || 30,
    preferredStyle: profile.preferredStyle || 'mixed',
    lastUpdated: new Date().toISOString(),
    skillLevel: profile.skillLevel || 'Beginner',
    learningType: profile.learningType || 'Visual',
    major: profile.major && ['Computer Science', 'Mathematics', 'Data Science', 'Engineering', 'Other'].includes(profile.major)
      ? profile.major
      : 'Other',
    currentCourses: Array.isArray(profile.currentCourses) ? profile.currentCourses : [],
    daysPerWeek: profile.daysPerWeek || 3,
    minutesPerSession: profile.minutesPerSession || 30,
    recentTopics: Array.isArray(profile.recentTopics) ? profile.recentTopics : [],
    selfRating: profile.selfRating && ['None', 'Basic', 'Intermediate', 'Advanced'].includes(profile.selfRating)
      ? profile.selfRating
      : 'Basic',
    primaryGoal: profile.primaryGoal && ['Master Basics', 'Exam Prep', 'Revise Gaps', 'Project Help', 'Interview Prep'].includes(profile.primaryGoal)
      ? profile.primaryGoal
      : 'Master Basics',
    defaultMode: profile.defaultMode && ['Studying', 'Revision'].includes(profile.defaultMode)
      ? profile.defaultMode
      : 'Studying',
    explanationLength: profile.explanationLength && ['Concise', 'Balanced', 'Detailed'].includes(profile.explanationLength)
      ? profile.explanationLength
      : 'Balanced',
    examplesPreference: profile.examplesPreference && ['Few', 'Many'].includes(profile.examplesPreference)
      ? profile.examplesPreference
      : 'Many',
    language: profile.language || 'English',
    codeLanguagePreference: profile.codeLanguagePreference && ['Python', 'JavaScript', 'C++', 'None'].includes(profile.codeLanguagePreference)
      ? profile.codeLanguagePreference
      : 'None'
  };
}

module.exports = { userProfileToSessionProfile };
