import { render, screen } from '@testing-library/react';

import { FixedHeader } from './FixedHeader';
import styles from './FixedHeader.module.css';

test('the header stays in place, the rest scrolls', () => {
  render(<div><FixedHeader><h1>Revue</h1></FixedHeader><p>contenu</p></div>);
  const band = screen.getByTestId('fixed-header');
  expect(band.className).toMatch(/fixed/);
  expect(band).toContainElement(screen.getByRole('heading', { name: 'Revue' }));
});

/**
 * A local stand-in, not a real component: Textes (Task 8/9) is the only
 * screen with two independently-scrolling columns under one FixedHeader.
 * This exercises the reusable `.scrolls` class those columns will share,
 * without building the real two-pane screen here.
 */
function ScrollPanes({
  header, left, right,
}: {
  readonly header: React.ReactNode;
  readonly left: React.ReactNode;
  readonly right: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      {header}
      <div style={{ display: 'flex' }}>
        <div data-testid="pane-left" className={styles['scrolls']}>{left}</div>
        <div data-testid="pane-right" className={styles['scrolls']}>{right}</div>
      </div>
    </div>
  );
}

test('two columns scroll independently under the same header', () => {
  render(
    <ScrollPanes
      header={<FixedHeader><h1>Textes</h1></FixedHeader>}
      left={<p>filtres</p>}
      right={<p>pages</p>}
    />,
  );
  expect(screen.getByTestId('pane-left').className).toMatch(/scrolls/);
  expect(screen.getByTestId('pane-right').className).toMatch(/scrolls/);
});
