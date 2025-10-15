import React from 'react';
import EmptyStateWithCategories from './EmptyStateWithCategories';
import ModernChatMessage from './ModernChatMessage';

export default function ChatStream({ 
  messages, 
  selectedCategory, 
  onCategoryChange, 
  inputValue, 
  onInputChange, 
  onSend, 
  isLoading 
}) {
  if (messages.length === 0) {
    return (
      <EmptyStateWithCategories
        onSubmit={onSend}
        selectedCategory={selectedCategory}
        onCategoryChange={onCategoryChange}
        inputValue={inputValue}
        onInputChange={onInputChange}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message, idx) => (
          <ModernChatMessage
            key={message.id || idx}
            message={message}
            isUser={message.isUser || message.sender === 'user'}
          />
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 rounded-2xl px-4 py-3 max-w-xs">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
