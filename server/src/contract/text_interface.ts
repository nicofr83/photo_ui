import type { CorrectionStatus, PageSpanSource, TranscriptionConfidence } from '@shared/enums';
import type { TextRange } from './filter_interface.ts';
import type { ResolvedDate } from './photo_interface.ts';

export interface TextRef {
  readonly kind: string;
  readonly id: string;
}

export interface TextDocument {
  readonly id: string;
  readonly kind: 'handwritten' | 'html';
  readonly title: string;
  readonly pageCount: number | null;
  readonly passageCount: number;
  readonly span: ResolvedDate | null;
  readonly hasPages: boolean;
}

export interface TextPage {
  readonly id: string;
  readonly documentId: string;
  readonly ordinal: number;
  readonly label: string | null;
  readonly width: number;
  readonly height: number;
  readonly window: ResolvedDate | null;
  readonly spanSource: PageSpanSource | null;
  readonly imageUrl: string;
  readonly regionsAvailable: false;
}

export interface LogEntryFields {
  readonly time: string | null;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly rawPosition: string | null;
  readonly placeName: string | null;
  readonly heading: string | null;
  readonly wind: string | null;
  readonly baro: number | null;
  readonly engineHours: number | null;
  readonly fixConfidence: TranscriptionConfidence;
  readonly remarkConfidence: TranscriptionConfidence;
}

export interface TextCorrection {
  readonly ref: TextRef;
  readonly text: string;
  readonly originalAtCorrection: string;
  readonly correctedAt: string;
  readonly status: CorrectionStatus;
}

export interface TextUnit {
  readonly ref: TextRef;
  readonly documentId: string;
  readonly pageId: string | null;
  readonly ordinal: number;
  readonly text: string;
  readonly textOriginal: string;
  readonly correction: TextCorrection | null;
  readonly confidence: TranscriptionConfidence;
  readonly date: ResolvedDate | null;
  readonly pageSpanSource: PageSpanSource | null;
  readonly overlappingPhotoCount: number;
  readonly highlights: readonly TextRange[];
  readonly logEntry: LogEntryFields | null;
}
