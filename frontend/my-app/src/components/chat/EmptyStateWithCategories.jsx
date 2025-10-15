import React, { useState } from 'react';
import './EmptyStateWithCategories.css';

const EmptyStateWithCategories = ({ 
  onSubmit, 
  selectedCategory, 
  onCategoryChange,
  inputValue,
  onInputChange
}) => {
  const [selectedModel, setSelectedModel] = useState('Llama');
  
  const categories = [
    { id: 'studying', label: 'Studying', icon: '🎓' },
    { id: 'explanation', label: 'Explanation', icon: '💡' },
    { id: 'revision', label: 'Revision', icon: '📚' }
  ];
  
  const models = ['ChatGPT', 'Llama', 'GPT-4'];
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSubmit(e);
    }
  };
  
        return (
          <div className="flex flex-col items-center gap-8">
            {/* Main heading */}
            <h2 className="font-bold leading-7 text-[21px] text-text tracking-[-0.6px]">
              Ready when you are.
            </h2>

            <div className="flex flex-col gap-6 w-[700px]">
              {/* Input area */}
              <div className="bg-surface border border-primary border-solid flex flex-col gap-4 items-start px-4 py-3 rounded-2xl">
                <textarea
                  className="w-full border-none outline-none font-normal leading-7 text-[18px] text-text-muted placeholder:text-text-muted tracking-[-0.4px] resize-none"
                  placeholder="Ask anything..."
                  value={inputValue}
                  onChange={onInputChange}
                  rows={4}
                />
                
                {/* Model selector and submit button */}
                <div className="flex gap-2 items-center justify-end w-full">
                  <div className="flex gap-1 items-center justify-center overflow-clip rounded">
                    <select
                      className="font-normal leading-5 text-[16px] text-text-secondary tracking-[-0.25px] border-none outline-none bg-transparent cursor-pointer"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      {models.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                    <div className="overflow-clip relative shrink-0 size-6">
                      <svg className="w-6 h-6 text-text-muted" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M7 10l5 5 5-5z"/>
                      </svg>
                    </div>
                  </div>
                  
                  <button
                    type="submit"
                    className="bg-primary flex gap-3 items-center justify-center overflow-clip px-5 py-3 rounded-full"
                    disabled={!inputValue.trim()}
                  >
                    <div className="relative shrink-0 size-6">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                  </button>
                </div>
              </div>

              {/* Category buttons */}
              <div className="flex gap-4 items-center justify-center">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`flex gap-3 items-center justify-center overflow-clip px-5 py-2.5 rounded-lg transition-colors ${
                      selectedCategory === cat.id 
                        ? 'border border-primary border-solid' 
                        : 'bg-surface rounded-lg shadow-elevated'
                    }`}
                    onClick={() => onCategoryChange(cat.id)}
                  >
                    <div className="relative shrink-0 size-6">
                      <span className="text-2xl">{cat.icon}</span>
                    </div>
                    <p className={`font-bold leading-7 text-[18px] tracking-[-0.4px] ${
                      selectedCategory === cat.id ? 'text-primary' : 'text-muted'
                    }`}>
                      {cat.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
};

export default EmptyStateWithCategories;