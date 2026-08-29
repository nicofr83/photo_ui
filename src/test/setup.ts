import '@testing-library/jest-dom/vitest';

import { server } from '../../mocks/node';
import { resetStore } from '../../mocks/store';

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { server.resetHandlers(); resetStore(); });
afterAll(() => { server.close(); });
