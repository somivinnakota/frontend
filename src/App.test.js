import { render, screen, fireEvent } from '@testing-library/react';
import axios from 'axios';
import App from './App';

// No real requests in tests: every call to the backend fails, as if it were switched off.
jest.mock('axios');

beforeEach(() => {
  axios.get.mockRejectedValue({ request: {} });
  axios.post.mockRejectedValue({ request: {} });
});

test('shows the navigation and opens on the Overview page', async () => {
  render(<App />);
  expect(screen.getByRole('link', { name: /social media/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /quarterly reports/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /overview/i })).toHaveClass('active');
  await screen.findByText(/could not load impact data/i); // let the page finish loading
});

test('says so when the backend cannot be reached', async () => {
  render(<App />);
  expect(await screen.findByText(/could not load impact data/i)).toBeInTheDocument();
});

test('the sidebar can be closed and opened, and remembers the choice', async () => {
  localStorage.clear();
  const { unmount } = render(<App />);
  const sidebar = screen.getByRole('complementary');
  expect(sidebar).not.toHaveClass('collapsed');

  fireEvent.click(screen.getByRole('button', { name: /close the sidebar/i }));
  expect(await screen.findByRole('button', { name: /open the sidebar/i })).toBeInTheDocument();
  expect(sidebar).toHaveClass('collapsed');
  expect(screen.getByRole('link', { name: /social media/i })).toBeInTheDocument(); // links still work

  unmount();
  render(<App />);
  expect(screen.getByRole('complementary')).toHaveClass('collapsed');
  await screen.findByText(/could not load impact data/i);
});