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
    if (inputValue && inputValue.trim && inputValue.trim()) {
      onSubmit(e);
    }
  };
  
  return (
    <div className="empty-state-container">
      <h2 className="empty-state-heading">Ready when you are.</h2>
      
      <form onSubmit={handleSubmit} className="empty-state-form">
        {/* Large Textarea Input */}
        <textarea
          className="empty-state-input"
          placeholder="Can you help me with logic problems?"
          value={inputValue}
          onChange={onInputChange}
          rows={4}
        />
        
        {/* Model Selector and Submit Button Row */}
        <div className="input-footer">
          <select 
            className="model-selector"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
          
          <button 
            type="submit" 
            className="submit-btn"
            disabled={!inputValue.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        
        {/* Category Selector */}
        <div className="category-selector">
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => onCategoryChange(cat.id)}
            >
              <span className="category-icon">{cat.icon}</span>
              <span className="category-label">{cat.label}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
};

export default EmptyStateWithCategories;