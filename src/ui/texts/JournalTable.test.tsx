import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '../../test/renderWithProviders';
import { DatePrecision, DateKind, DateSource, PageSpanSource, TextKind, TranscriptionConfidence } from '../../shared/enums';
import type { TextUnit } from '../../api/contract/text';

import { JournalTable } from './JournalTable';

const SLUG = '1999-transat';

const unit = (over: Partial<TextUnit> = {}): TextUnit => ({
  ref: { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' },
  documentId: 'logbook', pageId: 'logbook/p003', ordinal: 1,
  text: 'Mouillage devant Porlamar.', textOriginal: 'Mouillage devant Porlamar.',
  correction: null,
  confidence: TranscriptionConfidence.TRANSCRIBED,
  date: {
    start: '1999-12-08', end: '1999-12-08', precision: DatePrecision.DAY,
    kind: DateKind.READING, source: DateSource.LOG_ENTRY_DATE, bracketHours: null,
  } as never,
  dateOriginal: null,
  pageSpanSource: PageSpanSource.ENTRIES,
  overlappingPhotoCount: 0,
  highlights: [], logEntry: null, galleryCaption: null,
  ...over,
});

const setup = (
  units: readonly TextUnit[],
  onShowPhotos?: (ref: TextUnit['ref']) => void,
) =>
  renderWithProviders(
    <JournalTable
      units={units}
      slug={SLUG}
      noteTitle="journal de bord, page 3 du 08/12/1999"
      {...(onShowPhotos === undefined ? {} : { onShowPhotos })}
    />,
  );

describe('V1.7 — le registre en tableau', () => {
  test('renders the five columns and one row per line', () => {
    setup([unit()]);
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Texte' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Photos' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Corriger' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Créer une note' })).toBeInTheDocument();
    expect(screen.getByText('Mouillage devant Porlamar.')).toBeInTheDocument();
  });

  test('the pencil opens an editable, prefilled correction, and Enregistrer submits it', async () => {
    const user = userEvent.setup();
    setup([unit()]);
    await user.click(screen.getByRole('button', { name: /corriger la transcription/i }));
    const field = screen.getByRole('textbox');
    expect(field).toHaveValue('Mouillage devant Porlamar.');
    await user.clear(field);
    await user.type(field, 'Mouillage devant Porlamar, vent frais.');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument();
    });
  });
});

describe('V1.7, Nicolas — la colonne Photos, seulement sur le registre', () => {
  // Nicolas's ruling: a registre line has a precise date, so its overlap
  // window is narrow and the result usable — unlike a prose passage, which
  // only inherits its page's window (1 to 30+ days) and would bring back a
  // month of photos for a paragraph.
  test('a line with overlapping photos shows the count, clickable', async () => {
    const user = userEvent.setup();
    const opened: TextUnit['ref'][] = [];
    setup([unit({ overlappingPhotoCount: 7 })], (ref) => { opened.push(ref); });
    const button = screen.getByRole('button', { name: /7/ });
    expect(button).toHaveTextContent('7 ▸');
    await user.click(button);
    expect(opened).toEqual([{ kind: 'log_entry', id: 'logbook/p003/001' }]);
  });

  test('a line with no overlapping photos shows a dash, never a button', () => {
    setup([unit({ overlappingPhotoCount: 0 })], () => {});
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /—/ })).not.toBeInTheDocument();
  });

  test('without onShowPhotos, nothing in the column pretends to be clickable — same rule as elsewhere', () => {
    setup([unit({ overlappingPhotoCount: 7 })]);
    expect(screen.queryByText('7 ▸')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /7/ })).not.toBeInTheDocument();
  });
});

describe('V1.7 — la case « Créer une note » ouvre l\'éditeur aussitôt', () => {
  test('checking opens the editor, prefilled, unchecked until the note actually exists', async () => {
    const user = userEvent.setup();
    setup([unit()]);
    const box = screen.getByRole('checkbox', { name: /créer une note pour la ligne/i });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(screen.getByRole('textbox')).toHaveValue('Mouillage devant Porlamar.');
    // Spec: "il n'y a pas d'état intermédiaire" — still unchecked while
    // the editor is open, nothing created yet.
    expect(box).not.toBeChecked();
  });

  test('« Créer la note » creates it, derived from the line, and checks the box', async () => {
    const user = userEvent.setup();
    setup([unit()]);
    await user.click(screen.getByRole('checkbox', { name: /créer une note pour la ligne/i }));
    await user.click(screen.getByRole('button', { name: 'Créer la note' }));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /créer une note pour la ligne/i })).toBeChecked();
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('« Annuler » closes the editor and creates nothing — the box stays unchecked', async () => {
    const user = userEvent.setup();
    setup([unit()]);
    await user.click(screen.getByRole('checkbox', { name: /créer une note pour la ligne/i }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /créer une note pour la ligne/i })).not.toBeChecked();
  });

  test('unchecking an existing note asks for confirmation, then removes it', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup([unit()]);
    await user.click(screen.getByRole('checkbox', { name: /créer une note pour la ligne/i }));
    await user.click(screen.getByRole('button', { name: 'Créer la note' }));
    const box = await screen.findByRole('checkbox', { name: /créer une note pour la ligne/i, checked: true });

    await user.click(box);
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /créer une note pour la ligne/i })).not.toBeChecked();
    });
    confirmSpy.mockRestore();
  });

  test('cancelling the confirmation keeps the note and the checked box', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup([unit()]);
    await user.click(screen.getByRole('checkbox', { name: /créer une note pour la ligne/i }));
    await user.click(screen.getByRole('button', { name: 'Créer la note' }));
    const box = await screen.findByRole('checkbox', { name: /créer une note pour la ligne/i, checked: true });

    await user.click(box);
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /créer une note pour la ligne/i })).toBeChecked();
    confirmSpy.mockRestore();
  });
});

describe('V1.7 — le texte d\'origine reste visible sous une correction déjà appliquée', () => {
  test('a corrected line shows its original reading below, same pairing as elsewhere', () => {
    setup([unit({
      text: 'Mouillage devant Porlamar, vent d’est.',
      textOriginal: 'Mouillage devant Porlamar, vent dest.',
      correction: {
        ref: { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' },
        text: 'Mouillage devant Porlamar, vent d’est.',
        originalAtCorrection: 'Mouillage devant Porlamar, vent dest.',
        correctedAt: '2026-08-31T09:00:00.000Z' as never,
        date: null, originalDateAtCorrection: null,
        status: 'applied' as never,
      },
    })]);
    expect(screen.getByText('Mouillage devant Porlamar, vent dest.')).toBeInTheDocument();
  });
});
