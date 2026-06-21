// Risk Insights v2 — shared level palette, labels, and flag copy so every
// surface (Insights panel, distribution chart, Student Progress, Monitor) uses
// the same colors and wording. Class strings are written as literals so
// Tailwind's content scan keeps them in the build.

export const RISK_LEVELS = ['critical', 'high', 'watch', 'healthy'];

export const RISK_META = {
  critical: {
    label: 'Critical',
    bar: '#dc2626',
    leftBorder: 'border-l-4 border-l-red-500',
    leftBorderHeavy: 'border-l-8 border-l-red-600',
    pill: 'bg-red-100 text-red-700 border-red-200',
    chip: 'bg-red-600 text-white border-red-600',
    chipIdle: 'bg-white text-red-700 border-red-300 hover:bg-red-50',
    dot: 'bg-red-500',
  },
  high: {
    label: 'High',
    bar: '#ea580c',
    leftBorder: 'border-l-4 border-l-orange-500',
    leftBorderHeavy: 'border-l-8 border-l-orange-600',
    pill: 'bg-orange-100 text-orange-700 border-orange-200',
    chip: 'bg-orange-500 text-white border-orange-500',
    chipIdle: 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50',
    dot: 'bg-orange-500',
  },
  watch: {
    label: 'Watch',
    bar: '#ca8a04',
    leftBorder: 'border-l-4 border-l-yellow-400',
    leftBorderHeavy: 'border-l-8 border-l-yellow-500',
    pill: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    chip: 'bg-yellow-400 text-yellow-900 border-yellow-400',
    chipIdle: 'bg-white text-yellow-800 border-yellow-300 hover:bg-yellow-50',
    dot: 'bg-yellow-400',
  },
  healthy: {
    label: 'Healthy',
    bar: '#16a34a',
    leftBorder: 'border-l-4 border-l-green-400',
    leftBorderHeavy: 'border-l-8 border-l-green-500',
    pill: 'bg-green-100 text-green-700 border-green-200',
    chip: 'bg-green-500 text-white border-green-500',
    chipIdle: 'bg-white text-green-700 border-green-300 hover:bg-green-50',
    dot: 'bg-green-500',
  },
};

// Class Context override (Step 7) — gray "neutralized" border + CLASS OK pill.
export const CLASS_OVERRIDE_BORDER = 'border-l-4 border-l-gray-300';

export const riskMeta = (level) => RISK_META[level] || RISK_META.healthy;

export const FLAG_META = {
  no_engagement: { label: 'No Engagement', key: 'no_engagement' },
  low_pass_rate: { label: 'Low Pass Rate', key: 'low_pass_rate' },
  low_quiz_score: { label: 'Low Quiz Score', key: 'low_quiz_score' },
  stuck_topic: { label: 'Stuck Topic', key: 'stuck_topic' },
  // legacy fallbacks (older rows / heuristic flags)
  many_retries: { label: 'Stuck Topic', key: 'stuck_topic' },
  auto_advanced: { label: 'Auto-Advanced', key: 'auto_advanced' },
  no_activity: { label: 'No Activity', key: 'no_activity' },
};

export const flagLabel = (f) => (FLAG_META[f]?.label) || String(f || '').replace(/_/g, ' ');

// Chips shown in the flag filter row (Step 4).
export const FLAG_CHIPS = [
  { key: 'no_engagement', label: 'No Engagement' },
  { key: 'low_pass_rate', label: 'Low Pass Rate' },
  { key: 'low_quiz_score', label: 'Low Quiz Score' },
  { key: 'stuck_topic', label: 'Stuck Topic' },
];

// Human phrase for the dominant driver (backend already returns a phrase, but
// normalize the two non-driver sentinels for display).
export const driverPhrase = (d) => {
  if (!d || d === 'healthy') return null;
  if (d === 'new_enrollee') return 'new enrollee';
  if (d === 'multiple_factors') return 'multiple factors';
  return d;
};
