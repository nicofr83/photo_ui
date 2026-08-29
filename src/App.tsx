import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link } from 'react-router';

import { AppRoutes } from './app/router';
import { VolumeBanner } from './ui/primitives/VolumeBanner';

import './ui/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <VolumeBanner />
        <header>
          <strong>photo_ui</strong> <Link to="/taches">Tâches</Link>{' '}
          <Link to="/reglages">Réglages</Link>
        </header>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
