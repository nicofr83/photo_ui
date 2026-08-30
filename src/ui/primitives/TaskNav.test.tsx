import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { TaskNav } from './TaskNav';

test('v1.5: the four sub-pages, in order, each with its own URL', () => {
  render(<MemoryRouter initialEntries={['/textes/tache-a']}><TaskNav slug="tache-a" /></MemoryRouter>);
  const links = screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);
  expect(links).toEqual([
    ['Images', '/images/tache-a'], ['Textes', '/textes/tache-a'],
    ['Consigne', '/consigne/tache-a'], ['Revue', '/revue/tache-a'],
  ]);
});
