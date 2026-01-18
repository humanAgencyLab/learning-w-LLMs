import React from 'react';

const QuestionActions = ({ onNeedHelp, onSkip }) => {
  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-blue-200">
      <button
        onClick={onNeedHelp}
        className="px-4 py-2 text-sm font-medium text-[#4e81ee] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-all duration-200"
      >
        Need Help?
      </button>
      <button
        onClick={onSkip}
        className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-300 transition-all duration-200"
      >
        I Don't Know
      </button>
    </div>
  );
};

export default QuestionActions;
