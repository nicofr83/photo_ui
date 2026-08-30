import { render, screen } from '@testing-library/react';

import { App } from './App';

test('renders the application shell', () => {
  render(<App />);
  expect(screen.getByRole('banner')).toHaveTextContent('photo_ui');
});

test('v1.5, Task 12: the web-dating screen is reachable next to Réglages', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: 'Datation du site' })).toHaveAttribute(
    'href', '/dates-site',
  );
});
