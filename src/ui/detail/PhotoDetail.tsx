import { useState } from 'react';

import { useOverlappingTexts } from '../../api/hooks/useOverlappingTexts';
import { usePhoto } from '../../api/hooks/usePhoto';
import type { PhotoDetail as Detail } from '../../api/contract/photo';
import { ResolvedDateView } from '../date/ResolvedDate';
import { ErrorBanner } from '../primitives/ErrorBanner';
import { TextCard } from '../texts/TextCard';

import styles from './PhotoDetail.module.css';

interface Props {
  readonly cloudAssetId: string;
  readonly onClose: () => void;
}

/** Spec §5.2: the three failures are never confused, so they never share a message. */
const RENDER_FAILURE: Record<string, string> = {
  volume_unavailable:
    'Le volume des originaux est absent. C’est un problème de configuration, pas de cette photo.',
  source_file_missing: 'Le fichier de cette photo est introuvable.',
  not_renderable: 'Ce format ne produit aucune image.',
};

export function PhotoDetail({ cloudAssetId, onClose }: Props): React.JSX.Element {
  const { data, error, isPending } = usePhoto(cloudAssetId);
  const [showTexts, setShowTexts] = useState(false);

  if (error !== null) return <ErrorBanner error={error} />;
  if (isPending) return <p role="status">Chargement de la photo…</p>;

  return (
    <aside className={styles['panel']}>
      <button className={styles['close']} type="button" onClick={onClose}>
        Fermer
      </button>

      {data.render.available ? (
        <img className={styles['render']} data-testid="render" src={data.renderUrl} alt="" />
      ) : (
        <p className={styles['unavailable']} data-testid="render-unavailable">
          {RENDER_FAILURE[data.render.unavailableReason ?? ''] ?? 'Rendu indisponible.'}
        </p>
      )}

      <h2>{data.fileName}</h2>

      <p data-testid="main-date">
        <ResolvedDateView date={data.date} arbitration={data.arbitration} showDetail />
      </p>

      <p data-testid="position">{describePosition(data)}</p>

      <p data-testid="albums">{data.albumPaths.join(' · ')}</p>

      {/* FIRST-LEVEL blocks, never folded into the date. Spec §9.2. */}
      {data.proposal !== null ? (
        <section className={block(styles['proposal'])} data-testid="proposal-block">
          <h3 className={styles['heading']}>Proposition de datation</h3>
          <ResolvedDateView date={data.proposal.date} showDetail />
          <ul>
            {data.proposal.evidenceEntryIds.map((id) => (
              <li key={id}>
                <a className={styles['evidence']} data-testid={`evidence-${id}`} href={`#/textes/${id}`}>
                  Journal — {id}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.doubt !== null ? (
        <section className={block(styles['doubt'])} data-testid="doubt-block">
          <h3 className={styles['heading']}>Pourquoi il n’y a pas de proposition</h3>
          <p>{data.doubt.label ?? data.doubt.reason}</p>
        </section>
      ) : null}

      <ul className={styles['tags']}>
        {data.tags.map((tag) => (
          <li className={styles['tag']} key={tag.name} data-testid={`tag-${tag.name}`}>
            {tag.name}
            {/* A tag with no confidence is never dropped. Spec §6.3. */}
            {tag.confidence === null ? null : (
              <span className={styles['confidence']}> {tag.confidence}</span>
            )}
          </li>
        ))}
      </ul>

      {/* Spec §7.1's third extension: a DEDUCTION from appearance, its own
          register — never texts[] (period text) nor a human note. */}
      {data.caption !== null ? (
        <section className={block(styles['caption'])} data-testid="caption">
          <h3 className={styles['heading']}>Légende (machine)</h3>
          <p>{data.caption.text}</p>
          <ul className={styles['tags']}>
            {data.caption.keywords.map((keyword) => (
              <li className={styles['tag']} key={keyword}>{keyword}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Contract §4.2, the reverse direction of the same predicate TextsScreen
          opens from a passage. Loaded on demand: most photos cover nothing. */}
      {data.overlappingTextCount > 0 ? (
        <OverlappingTexts
          cloudAssetId={cloudAssetId}
          count={data.overlappingTextCount}
          expanded={showTexts}
          onToggle={() => { setShowTexts((v) => !v); }}
        />
      ) : null}
    </aside>
  );
}

function OverlappingTexts({
  cloudAssetId, count, expanded, onToggle,
}: {
  readonly cloudAssetId: string;
  readonly count: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <section className={styles['overlap']}>
      <button className={styles['toggle']} type="button" onClick={onToggle}>
        {expanded ? 'Masquer' : 'Voir'} les {count} texte{count > 1 ? 's' : ''}
      </button>
      {expanded ? <OverlappingTextsList cloudAssetId={cloudAssetId} /> : null}
    </section>
  );
}

function OverlappingTextsList({ cloudAssetId }: { readonly cloudAssetId: string }): React.JSX.Element {
  const texts = useOverlappingTexts(cloudAssetId);

  if (texts.error !== null) return <ErrorBanner error={texts.error} />;
  if (texts.isPending) return <p role="status">Chargement des textes…</p>;

  return (
    <>
      {texts.data.items.map((unit) => (
        <TextCard key={`${unit.ref.kind}:${unit.ref.id}`} unit={unit} />
      ))}
    </>
  );
}

function block(variant: string | undefined): string {
  return [styles['block'], variant].filter((c) => c !== undefined).join(' ');
}

function describePosition(photo: Detail): string {
  if (photo.position === null) return 'sans position';
  const nature = photo.position.kind === 'reading' ? 'relevée' : 'interpolée';
  return `${photo.position.lat.toFixed(2)}, ${photo.position.lon.toFixed(2)} — ${nature}`;
}
