import React from 'react';

function cellColor(cell) {
  if (!cell || cell.attempts === 0) return '#f3f4f6';
  if (cell.passRate == null) return '#f3f4f6';
  if (cell.passRate >= 85) return '#16a34a';
  if (cell.passRate >= 70) return '#65a30d';
  if (cell.passRate >= 55) return '#eab308';
  if (cell.passRate >= 40) return '#f97316';
  return '#dc2626';
}

function textColor(cell) {
  if (!cell || cell.attempts === 0) return '#9ca3af';
  if (cell.passRate >= 55) return '#ffffff';
  return '#ffffff';
}

export default function TopicStudentHeatmap({ topics = [], students = [] }) {
  if (!topics.length || !students.length) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
        Heatmap needs at least one topic and one enrolled student.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0 min-w-full">
        <thead>
          <tr>
            <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 sticky left-0 bg-white z-10">
              Student
            </th>
            {topics.map((t) => (
              <th
                key={t.id}
                className="text-xs font-medium text-gray-500 px-2 py-2 align-bottom"
                style={{ minWidth: 80 }}
                title={t.title}
              >
                <div className="truncate max-w-[140px] mx-auto">{t.title}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentId}>
              <td className="px-3 py-1 text-sm text-gray-800 sticky left-0 bg-white">
                <div className="flex items-center gap-2">
                  <span className="truncate max-w-[140px]">{s.name || s.username}</span>
                  {s.isSynthetic && (
                    <span
                      className="text-[9px] uppercase px-1 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200"
                      title={s.personaTag || 'Synthetic student'}
                    >
                      syn
                    </span>
                  )}
                </div>
              </td>
              {s.cells.map((cell) => (
                <td
                  key={cell.courseTopicId}
                  className="px-1 py-1"
                  style={{ minWidth: 80 }}
                >
                  <div
                    className="rounded text-center text-[11px] font-semibold py-2"
                    style={{
                      backgroundColor: cellColor(cell),
                      color: textColor(cell),
                    }}
                    title={
                      cell.attempts === 0
                        ? 'No attempts'
                        : `${cell.passes}/${cell.attempts} passed · ${cell.passRate}%`
                    }
                  >
                    {cell.attempts === 0 ? '—' : `${cell.passRate ?? 0}%`}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
