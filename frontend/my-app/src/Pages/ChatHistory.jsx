import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/ChatHistory.css';
import MainLayout from '../layouts/MainLayout';

function ChatHistory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]); // stores filtered results
  const [searched, setSearched] = useState(false); // tracks if search has been performed
  const [bookmarks, setBookmarks] = useState({});
  const navigate = useNavigate();

  // Sample chat data
  // In a real application, this data would likely come from an API or database
  // For demonstration purposes, we will use a static array of objects
  const chatData = [
    {
      date: 'Today',
      summaries: [
        'Discussed study strategies and resources.',
        'Reviewed previous exam questions and answers.',
      ],
    },
    {
      date: '5 days ago',
      summaries: ['Explored new learning techniques and tools.'],
    },
    {
      date: 'June 23, 2025',
      summaries: [
        'Explored new learning techniques and tools.',
        'Reviewed for Biology exam.',
        'Completed Calculus practice problems.',
        'Revised Java code examples.',
      ],
    },
  ];

  const handleSearchClick = (e) => {
    e.preventDefault();
    // filter only when the button is clicked
    const filtered = chatData
      .map((group) => ({
        date: group.date,
        summaries: group.summaries.filter((summary) =>
          summary.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      }))
      .filter((group) => group.summaries.length > 0);

    setResults(filtered);
    setSearched(true); // mark that user clicked Search
  };

  // Decide which data to show (search results or all chats if no search yet)
  const dataToDisplay = searched ? results : chatData;

  const toggleBookmark = (summaryKey) => {
    setBookmarks((prev) => ({
      ...prev,
      [summaryKey]: !prev[summaryKey],
    }));
  };

  const handleSummaryClick = (summaryKey) => {
    // Navigate to the chat page with the summary key
    navigate(`/summary/${encodeURIComponent(summaryKey)}`);
  };

  return (
    <MainLayout>
      <div className="chat-history-container">
        <h1 className="chat-history-heading">Chat History</h1>
        <h3 className="chat-history-description">
          View your previous conversations with AI Study Assistant
        </h3>

        <div className="chat-history-list">
          <div className="chat-history-search-container">
            <input
              type="text"
              placeholder="Search..."
              className="chat-history-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              className="chat-history-search-button"
              onClick={handleSearchClick}
            >
              Search
            </button>
          </div>

          {/* Display the chat history */}
          {/* replaces your manually typed chat summaries */}
          {dataToDisplay.map((group, index) => (
            <div key={index} className="chat-history-group">
              <div className="chat-history-date">
                <h2>{group.date}</h2>
              </div>
              {group.summaries.map((summary, i) => {
                const summaryKey = `${group.date}-${i}`;
                const isBookmarked = bookmarks[summaryKey];
                return (
                  <div
                    key={i}
                    className="chat-history-summary"
                    onClick={() => handleSummaryClick(summaryKey)}
                  >
                    <p>{summary}</p>
                    <button
                      className={`bookmark-button ${isBookmarked ? 'bookmarked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(summaryKey);
                      }}
                    >
                      {' '}
                      {isBookmarked ? '★' : '☆'}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}

export default ChatHistory;
