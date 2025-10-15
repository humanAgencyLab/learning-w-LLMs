import React from 'react';

export default function Composer({ onSend, inputValue, onInputChange, isLoading }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSend(inputValue);
      onInputChange({ target: { value: '' } });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="rounded-2xl border bg-white p-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1">
          <textarea
            value={inputValue}
            onChange={onInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything..."
            className="w-full resize-none border-none outline-none text-sm placeholder:text-neutral-500"
            rows={1}
            disabled={isLoading}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <select 
            className="text-xs border border-neutral-200 rounded-lg px-2 py-1 bg-neutral-50"
            defaultValue="Llama"
          >
            <option value="Llama">Llama</option>
            <option value="ChatGPT">ChatGPT</option>
            <option value="GPT-4">GPT-4</option>
          </select>
          
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="w-8 h-8 bg-blue-500 text-white rounded-lg flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
