import { render, screen } from '@testing-library/react';
import App from './App';

test('renders AI Study Assistant', () => {
  render(<App />);
  const titleElement = screen.getByText(/AI Study Assistant/i);
  expect(titleElement).toBeInTheDocument();
});
