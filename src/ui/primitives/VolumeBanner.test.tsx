import { screen, waitFor } from '@testing-library/react';

import { store } from '../../../mocks/store';
import { renderWithProviders } from '../../test/renderWithProviders';

import { VolumeBanner } from './VolumeBanner';

describe('spec §5.1/§9 — ONE global banner when the originals volume is unmounted', () => {
  test('nothing renders while the volume is available', async () => {
    const { queryClient } = renderWithProviders(<VolumeBanner />);
    await waitFor(() => {
      expect(queryClient.getQueryState(['system', 'status'])?.status).toBe('success');
    });
    expect(screen.queryByTestId('volume-banner')).not.toBeInTheDocument();
  });

  test('the banner appears when originals is unmounted, and says what still works', async () => {
    store.originalsAvailable = false;
    renderWithProviders(<VolumeBanner />);
    const banner = await screen.findByTestId('volume-banner');
    expect(banner).toHaveTextContent(/vignettes.*restent utilisables/i);
    expect(banner).toHaveTextContent(/export.*bloqué/i);
  });
});
