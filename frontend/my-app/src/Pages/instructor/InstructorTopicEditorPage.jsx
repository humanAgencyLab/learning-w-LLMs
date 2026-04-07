import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as instructorApi from '../../lib/instructorApi';

const DIFFICULTIES = ['intro', 'core', 'apply'];
const DIFFICULTY_LABELS = { intro: 'Intro', core: 'Core', apply: 'Apply' };
const DIFFICULTY_COLORS = {
  intro: 'bg-green-50 text-green-700 border-green-200',
  core: 'bg-blue-50 text-blue-700 border-blue-200',
  apply: 'bg-purple-50 text-purple-700 border-purple-200',
};
const COGNITIVE_LEVELS = ['remember', 'understand', 'apply', 'analyze'];
const QUESTION_TYPES = ['conceptual', 'applied', 'recall', 'analytical'];
// Keep these aligned with backend validators (topicPlanValidator.js).
// These are used for enabling/disabling "Add" controls (not displayed as "x/y",
// because that UI reads like course progress rather than per-topic limits).
const MAX_MODULES_PER_TOPIC = 8;
const MAX_MILESTONES_PER_MODULE = 8;

function generateModuleId() {
  return 'mod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function emptyModule() {
  return {
    moduleId: generateModuleId(),
    title: '',
    description: '',
    difficulty: 'core',
    points: 100,
    milestones: [{ text: '' }, { text: '' }],
    quizPattern: {
      questionCount: 5,
      questionTypes: [{ type: 'conceptual', weight: 50 }, { type: 'applied', weight: 50 }],
      difficultyMix: { easy: 30, medium: 50, hard: 20 },
      cognitiveLevel: 'understand',
      constraints: '',
    },
  };
}

// ─── Milestone Row ─────────────────────────────────────────────────────────
function MilestoneRow({ milestone, index, total, onChange, onRemove, onAdd }) {
  return (
    <div className="flex items-center gap-2 group">
      <span className="text-xs text-gray-400 w-5 text-right shrink-0">{index + 1}.</span>
      <input
        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none transition-colors"
        placeholder={`Milestone ${index + 1}`}
        value={milestone.text}
        onChange={(e) => onChange(index, e.target.value)}
      />
      {total > 2 && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all text-lg leading-none px-1"
          title="Remove milestone"
        >
          &times;
        </button>
      )}
      {index === total - 1 && total < MAX_MILESTONES_PER_MODULE && (
        <button
          type="button"
          onClick={onAdd}
          className="text-blue-500 hover:text-blue-700 text-lg leading-none px-1 shrink-0"
          title="Add milestone"
        >
          +
        </button>
      )}
    </div>
  );
}

// ─── Quiz Pattern Section ──────────────────────────────────────────────────
function QuizPatternSection({ pattern, onChange }) {
  const [open, setOpen] = useState(false);
  const p = pattern || {};
  const mix = p.difficultyMix || { easy: 30, medium: 50, hard: 20 };

  const update = (field, value) => onChange({ ...p, [field]: value });
  const updateMix = (field, value) => {
    const num = Math.max(0, Math.min(100, parseInt(value) || 0));
    onChange({ ...p, difficultyMix: { ...mix, [field]: num } });
  };

  return (
    <div className="mt-3 border border-gray-100 rounded-lg bg-gray-50/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
      >
        <span>Quiz Pattern</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Question count</label>
              <input
                type="number" min={3} max={10}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                value={p.questionCount || 5}
                onChange={(e) => update('questionCount', parseInt(e.target.value) || 5)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cognitive level</label>
              <select
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white"
                value={p.cognitiveLevel || 'understand'}
                onChange={(e) => update('cognitiveLevel', e.target.value)}
              >
                {COGNITIVE_LEVELS.map((l) => (
                  <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Difficulty mix</label>
            <div className="flex gap-3">
              {['easy', 'medium', 'hard'].map((d) => (
                <label key={d} className="flex items-center gap-1 text-xs">
                  <span className="capitalize text-gray-600">{d}</span>
                  <input
                    type="number" min={0} max={100}
                    className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center"
                    value={mix[d] ?? 0}
                    onChange={(e) => updateMix(d, e.target.value)}
                  />
                  <span className="text-gray-400">%</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Instructor notes</label>
            <input
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="e.g. Focus on real-world examples"
              value={p.constraints || ''}
              onChange={(e) => update('constraints', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Module Card ───────────────────────────────────────────────────────────
function ModuleCard({ module, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }) {
  const [expanded, setExpanded] = useState(true);

  const updateField = (field, value) => onUpdate({ ...module, [field]: value });

  const updateMilestone = (i, text) => {
    const next = [...module.milestones];
    next[i] = { text };
    onUpdate({ ...module, milestones: next });
  };
  const removeMilestone = (i) => {
    onUpdate({ ...module, milestones: module.milestones.filter((_, j) => j !== i) });
  };
  const addMilestone = () => {
    onUpdate({ ...module, milestones: [...module.milestones, { text: '' }] });
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-50/80 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1 shrink-0">
          {index > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="text-gray-400 hover:text-gray-600 text-xs px-0.5" title="Move up">&#9650;</button>
          )}
          {index < total - 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="text-gray-400 hover:text-gray-600 text-xs px-0.5" title="Move down">&#9660;</button>
          )}
        </div>
        <span className="text-xs font-semibold text-gray-400 shrink-0">M{index + 1}</span>
        <span className="font-medium text-sm text-gray-800 flex-1 truncate">
          {module.title || <span className="text-gray-400 italic">Untitled module</span>}
        </span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_COLORS[module.difficulty] || DIFFICULTY_COLORS.core}`}>
          {DIFFICULTY_LABELS[module.difficulty] || 'Core'}
        </span>
        <span className="text-xs text-gray-400">{module.milestones?.length || 0} milestones</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 py-4 space-y-3">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                value={module.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Module title"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Difficulty</label>
              <select
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                value={module.difficulty}
                onChange={(e) => updateField('difficulty', e.target.value)}
              >
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Points</label>
              <input
                type="number" min={0}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center"
                value={module.points}
                onChange={(e) => updateField('points', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
              value={module.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Brief description of this module"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Milestones ({module.milestones?.length || 0})
            </label>
            <div className="space-y-1.5">
              {(module.milestones || []).map((m, i) => (
                <MilestoneRow
                  key={i}
                  milestone={m}
                  index={i}
                  total={module.milestones.length}
                  onChange={updateMilestone}
                  onRemove={removeMilestone}
                  onAdd={addMilestone}
                />
              ))}
            </div>
          </div>

          <QuizPatternSection
            pattern={module.quizPattern}
            onChange={(qp) => updateField('quizPattern', qp)}
          />

          {total > 1 && (
            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={onRemove}
                className="text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                Remove module
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI Edit Panel (draft only) ─────────────────────────────────────────────
function AiEditPanel({ courseId, topicId, isDraft, onApplied }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (!isDraft) return null;

  const submit = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      await instructorApi.aiModifyTopic(courseId, topicId, prompt.trim());
      setResult({ ok: true, msg: 'Applied successfully.' });
      setPrompt('');
      onApplied();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 border border-indigo-200 rounded-xl bg-indigo-50/40 p-4">
      <h3 className="text-sm font-semibold text-indigo-900 mb-1">AI Edit</h3>
      <p className="text-xs text-indigo-700/80 mb-2">
        Describe changes and AI will update this draft topic in-place (add/remove modules, adjust milestones, change quiz patterns, etc.).
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 border border-indigo-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
          placeholder='e.g. "Add a module on recursion" or "Reduce to 3 milestones per module"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          disabled={busy}
        />
        <button
          type="button"
          disabled={busy || !prompt.trim()}
          onClick={submit}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
        >
          {busy && (
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          Apply
        </button>
      </div>
      {result && (
        <p className={`text-xs mt-2 ${result.ok ? 'text-green-700' : 'text-red-700'}`}>{result.msg}</p>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function InstructorTopicEditorPage() {
  const { courseId, topicId } = useParams();
  const [topic, setTopic] = useState(null);
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [modules, setModules] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await instructorApi.getTopic(courseId, topicId);
      const t = res.data?.topic;
      setTopic(t);
      setTitle(t?.title || '');
      setObjective(t?.objective || '');
      setModules(t?.modules || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [courseId, topicId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      await instructorApi.updateTopic(courseId, topicId, { title, objective, modules });
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const updateModule = (index, updated) => {
    const next = [...modules];
    next[index] = updated;
    setModules(next);
  };
  const removeModule = (index) => setModules(modules.filter((_, i) => i !== index));
  const addModule = () => setModules([...modules, emptyModule()]);
  const moveModule = (from, to) => {
    const next = [...modules];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setModules(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">Loading topic...</div>
      </div>
    );
  }

  const STATUS_STYLES = {
    draft: 'bg-gray-100 text-gray-600',
    approved: 'bg-yellow-50 text-yellow-700',
    published: 'bg-green-50 text-green-700',
    unpublished: 'bg-red-50 text-red-600',
  };

  return (
    <div className="p-6 max-w-3xl mx-auto overflow-y-auto h-full pb-24">
      {/* Navigation */}
      <Link to={`/instructor/courses/${courseId}`} className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to course
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mt-3 mb-6">
        <h1 className="text-xl font-bold text-gray-900">Edit Topic</h1>
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[topic?.status] || STATUS_STYLES.draft}`}>
          {topic?.status}
        </span>
      </div>

      {/* Error / Success feedback */}
      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <span>&#9888;</span> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {saved && (
        <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Saved successfully
        </div>
      )}

      {/* AI Edit Panel — draft topics only */}
      <AiEditPanel
        courseId={courseId}
        topicId={topicId}
        isDraft={topic?.status === 'draft'}
        onApplied={load}
      />

      {/* Title + Objective */}
      <div className="space-y-3 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Topic title</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Introduction to Java"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Objective</label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm min-h-[70px] focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-y"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="What students will learn from this topic"
          />
        </div>
      </div>

      {/* Modules */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Modules ({modules.length})
          </h2>
          {modules.length < MAX_MODULES_PER_TOPIC && (
            <button
              type="button"
              onClick={addModule}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add module
            </button>
          )}
        </div>
        <div className="space-y-3">
          {modules.map((m, i) => (
            <ModuleCard
              key={m.moduleId || i}
              module={m}
              index={i}
              total={modules.length}
              onUpdate={(updated) => updateModule(i, updated)}
              onRemove={() => removeModule(i)}
              onMoveUp={() => moveModule(i, i - 1)}
              onMoveDown={() => moveModule(i, i + 1)}
            />
          ))}
          {modules.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
              <p className="text-gray-400 text-sm mb-2">No modules yet</p>
              <button
                type="button"
                onClick={addModule}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Add your first module
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-6 px-6 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <span className="text-xs text-gray-400">
          {modules.length} module{modules.length !== 1 ? 's' : ''} · {modules.reduce((s, m) => s + (m.milestones?.length || 0), 0)} milestones
        </span>
      </div>
    </div>
  );
}
