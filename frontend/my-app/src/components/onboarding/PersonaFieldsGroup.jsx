import React from 'react';

/**
 * Shared persona-aligned profile fields used by both the signup Onboarding
 * page and the course-join modal. The three fields mirror the server-side
 * User.profile and Enrollment.priorKnowledge schemas, so the wire format
 * stays consistent for both real and synthetic students.
 */

export const PROGRAMMING_EXPOSURE_OPTIONS = [
  { value: 'none', label: 'None', desc: 'Never written code' },
  { value: 'some', label: 'Some', desc: 'Intro course or self-taught basics' },
  { value: 'lots', label: 'Lots', desc: 'Comfortable writing programs' },
];

export const MOTIVATION_OPTIONS = [
  { value: 'grade', label: 'Grade', desc: 'Pass the class / earn a good grade' },
  { value: 'curiosity', label: 'Curiosity', desc: 'Genuine interest in the subject' },
  { value: 'career', label: 'Career', desc: 'Skills I need for a job / internship' },
  { value: 'requirement', label: 'Requirement', desc: 'Degree requires this course' },
];

export const DEFAULT_PERSONA_FIELDS = {
  programmingExposure: '',
  motivationType: '',
  selfConfidence: null,
};

export function personaFieldsToPayload(fields) {
  const out = {};
  if (fields.programmingExposure) out.programmingExposure = fields.programmingExposure;
  if (fields.motivationType) out.motivationType = fields.motivationType;
  if (fields.selfConfidence != null) out.selfConfidence = fields.selfConfidence;
  return out;
}

export default function PersonaFieldsGroup({ values, onChange, compact = false, heading = null, helper = null }) {
  const set = (patch) => onChange({ ...values, ...patch });

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {heading && (
        <div>
          <p className="text-sm font-semibold text-gray-900">{heading}</p>
          {helper && <p className="text-xs text-gray-500 mt-0.5">{helper}</p>}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Prior programming experience
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PROGRAMMING_EXPOSURE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set({ programmingExposure: opt.value })}
              className={`text-left px-3 py-2 rounded-xl border-2 transition-all ${
                values.programmingExposure === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <span
                className={`block text-sm font-medium ${
                  values.programmingExposure === opt.value ? 'text-blue-700' : 'text-gray-800'
                }`}
              >
                {opt.label}
              </span>
              <span className="block text-[11px] text-gray-500 mt-0.5">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          What motivates you most here?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set({ motivationType: opt.value })}
              className={`text-left px-3 py-2 rounded-xl border-2 transition-all ${
                values.motivationType === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <span
                className={`block text-sm font-medium ${
                  values.motivationType === opt.value ? 'text-blue-700' : 'text-gray-800'
                }`}
              >
                {opt.label}
              </span>
              <span className="block text-[11px] text-gray-500 mt-0.5">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          How confident are you going in? <span className="text-gray-400 font-normal">(1 = not at all, 5 = very)</span>
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set({ selfConfidence: n })}
              className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                values.selfConfidence === n
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
