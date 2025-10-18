import React, { useState } from 'react';
import '../styles/Favorites.css';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';

function Favorites() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]); // stores filtered results
  const [searched, setSearched] = useState(false); // tracks if search has been performed
  const navigate = useNavigate();

  // Sample favorite data
  // In a real application, this data would likely come from an API or database
  // For demonstration purposes, we will use a static array of objects
  const favoriteData = [
    {
      date: 'Today',
      summaries: ['Reviewed previous exam questions and answers.'],
    },
    {
      date: 'June 23, 2025',
      summaries: [
        'Explored new learning techniques and tools.',
        'Reviewed for Biology exam.',
      ],
    },
  ];

  const handleSearchClick = (e) => {
    e.preventDefault();
    // filter only when the button is clicked
    const filtered = favoriteData
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

  // Decide which data to show (search results or all favorites if no search yet)
  const dataToDisplay = searched ? results : favoriteData;

  const handleSummaryClick = (summaryKey) => {
    // Navigate to the chat page with the summary key
    // navigation will change when connected to backend
    navigate(`/summary/${encodeURIComponent(summaryKey)}`);
  };

  return (
    <MainLayout>
      <div className="favorites-container">
        <h1 className="favorites-heading"> Favorites</h1>
        <h3 className="favorites-description">
          View bookmarked conversation with AI Study Assistant
        </h3>

        <div className="favorites-list">
          <div className="favorites-search-container">
            <input
              type="text"
              placeholder="Search favorites..."
              className="favorites-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              className="favorites-search-button"
              onClick={handleSearchClick}
            >
              Search
            </button>
          </div>

          {dataToDisplay.map((group, index) => (
            <div key={index} className="favorites-group">
              <div className="favorites-date">
                <h2>{group.date}</h2>
              </div>
              {group.summaries.map((summary, i) => (
                <div
                  key={i}
                  className="favorites-summary"
                  onClick={() => handleSummaryClick(`${group.date}-${i}`)}
                >
                  <p>{summary}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}

export default Favorites;
