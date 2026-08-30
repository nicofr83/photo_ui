import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link } from 'react-router';

import { AppRoutes } from './app/router';
import { VolumeBanner } from './ui/primitives/VolumeBanner';

import styles from './App.module.css';
import './ui/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className={styles['shell']}>
          <VolumeBanner />
          <header className={styles['globalHeader']}>
            <strong>photo_ui</strong> <Link to="/taches">Tâches</Link>{' '}
            <Link to="/dates-site">Datation du site</Link>{' '}
            <Link to="/reglages">Réglages</Link>
          </header>
          {/* v1.5, Task 6: this is what a screen's own FixedHeader is bounded
              by — its "1fr" is the viewport minus the banner and this header,
              never a hardcoded height. */}
          <div className={styles['routes']}>
            <AppRoutes />
          </div>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
