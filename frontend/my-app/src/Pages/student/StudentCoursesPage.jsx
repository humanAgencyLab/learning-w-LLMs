import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as courseApi from '../../lib/courseApi';
import PersonaFieldsGroup, {
  DEFAULT_PERSONA_FIELDS,
  personaFieldsToPayload,
} from '../../components/onboarding/PersonaFieldsGroup';

function CourseOnboardingModal({ accessCode, onComplete, onSkip }) {
  const [selfRating, setSelfRating] = useState('');
  const [relevantExperience, setRelevantExperience] = useState('');
  const [specificGoals, setSpecificGoals] = useState('');
  const [persona, setPersona] = useState({ ...DEFAULT_PERSONA_FIELDS });
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);

  // Values must be Enrollment.priorKnowledge.selfRating enum members
  // ('none'|'beginner'|'intermediate'|'advanced') — pilot B1: the old
  // 'some_knowledge' value failed backend validation and stalled the join.
  const RATINGS = [
    { value: 'none', label: 'Beginner', desc: 'New to this subject' },
    { value: 'beginner', label: 'Some knowledge', desc: 'Familiar with basics' },
    { value: 'intermediate', label: 'Intermediate', desc: 'Comfortable with key concepts' },
    { value: 'advanced', label: 'Advanced', desc: 'Strong understanding, looking to deepen' },
  ];

  const submit = async () => {
    setJoining(true);
    setError(null);
    try {
      const priorKnowledge = { ...personaFieldsToPayload(persona) };
      if (selfRating) priorKnowledge.selfRating = selfRating;
      if (relevantExperience.trim()) priorKnowledge.relevantExperience = relevantExperience.trim();
      if (specificGoals.trim()) priorKnowledge.specificGoals = specificGoals.trim();
      await courseApi.joinCourse({
        accessCode,
        priorKnowledge: Object.keys(priorKnowledge).length > 0 ? priorKnowledge : undefined,
      });
      onComplete();
    } catch (e) {
      setError(e.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Tell us about yourself</h2>
          <p className="text-sm text-gray-500 mb-5">
            This helps the AI personalize your learning experience. All fields are optional.
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Self-rating */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How would you rate your knowledge of this subject?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setSelfRating(r.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                    selfRating === r.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className={`text-sm font-medium ${selfRating === r.value ? 'text-blue-700' : 'text-gray-800'}`}>
                    {r.label}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Relevant experience */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Any relevant experience?
            </label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              placeholder="e.g. Took an intro course, self-taught basics, work experience..."
              value={relevantExperience}
              onChange={(e) => setRelevantExperience(e.target.value)}
            />
          </div>

          {/* Learning goals */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What do you want to get out of this course?
            </label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              placeholder="e.g. Pass the exam, build a project, understand fundamentals..."
              value={specificGoals}
              onChange={(e) => setSpecificGoals(e.target.value)}
            />
          </div>

          {/* Persona fields — shared with signup onboarding */}
          <div className="mb-6">
            <PersonaFieldsGroup values={persona} onChange={setPersona} compact />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={joining}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex-1"
            >
              {joining ? 'Joining...' : 'Join course'}
            </button>
            <button
              type="button"
              onClick={onSkip}
              disabled={joining}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudentCoursesPage() {
  const [enrollments, setEnrollments] = useState([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(null); // holds accessCode when open
  const [joinSuccess, setJoinSuccess] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await courseApi.listMyCourses();
      setEnrollments(res.data?.enrollments || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    // Open the onboarding modal instead of joining directly
    setShowOnboarding(code.trim());
  };

  const handleOnboardingComplete = async () => {
    setShowOnboarding(null);
    setCode('');
    setJoinSuccess('Course joined successfully!');
    setTimeout(() => setJoinSuccess(null), 3000);
    await load();
  };

  const handleOnboardingSkip = async () => {
    // Join without prior knowledge
    try {
      await courseApi.joinCourse({ accessCode: showOnboarding });
      setShowOnboarding(null);
      setCode('');
      setJoinSuccess('Course joined successfully!');
      setTimeout(() => setJoinSuccess(null), 3000);
      await load();
    } catch (err) {
      setError(err.message);
      setShowOnboarding(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Courses</h1>

      {/* Onboarding modal */}
      {showOnboarding && (
        <CourseOnboardingModal
          accessCode={showOnboarding}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* Join form */}
      <div className="border border-gray-200 rounded-xl bg-white p-5 mb-8">
        <h2 className="font-semibold text-gray-800 mb-1">Join a course</h2>
        <p className="text-xs text-gray-500 mb-3">Enter the access code provided by your instructor.</p>
        <form onSubmit={handleJoinSubmit} className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono uppercase tracking-wider focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            placeholder="Access code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            Join
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <span>&#9888;</span> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {joinSuccess && (
        <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {joinSuccess}
        </div>
      )}

      {/* Course list */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-pulse text-gray-400">Loading courses...</div>
        </div>
      ) : enrollments.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          <p className="text-gray-500 text-sm">No courses yet.</p>
          <p className="text-gray-400 text-xs mt-1">Join a course using the access code from your instructor.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enrollments.map((en) => {
            const c = en.courseId;
            const id = typeof c === 'object' && c?._id ? c._id : c;
            const title = typeof c === 'object' && c?.title ? c.title : 'Course';
            const joinedAt = en.joinedAt ? new Date(en.joinedAt).toLocaleDateString() : null;
            return (
              <Link
                key={en._id}
                to={`/courses/${id}/topics`}
                className="block border border-gray-200 rounded-xl bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                      {title}
                    </h3>
                    {joinedAt && (
                      <p className="text-xs text-gray-400 mt-1">Joined {joinedAt}</p>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
