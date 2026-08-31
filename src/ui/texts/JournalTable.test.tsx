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

const setup = (units: readonly TextUnit[]) =>
  renderWithProviders(<JournalTable units={units} slug={SLUG} noteTitle="journal de bord, page 3 du 08/12/1999" />);

describe('V1.7 — le registre en tableau', () => {
  test('renders the four columns and one row per line', () => {
    setup([unit()]);
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Texte' })).toBeInTheDocument();
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
