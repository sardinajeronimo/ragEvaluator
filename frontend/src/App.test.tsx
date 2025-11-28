import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the main page title', () => {
  render(<App />);
  const titleElement = screen.getByText(/RAG Evaluator/i);
  expect(titleElement).toBeInTheDocument();
});
