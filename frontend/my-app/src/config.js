export const API_BASE = process.env.REACT_APP_API_BASE_URL || '';

// Log helpful warning in development if API_BASE is empty
if (process.env.NODE_ENV === 'development' && !API_BASE) {
  console.log(
    '🔧 Development mode: Using CRA proxy to backend (http://localhost:5001)',
  );
  console.log(
    '💡 To use a different API URL, set REACT_APP_API_BASE_URL in .env',
  );
}
