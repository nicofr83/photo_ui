-- V1.7 : la note d'une image survit à son retrait de la tâche. Bug signalé
-- par `front` sur `zz-repro-bug1` : retirer une image effaçait sa note avec
-- la ligne, la resélection repartait de zéro (`note: null`).
--
-- `app.task_image` reste INCHANGÉE — le retrait reste un vrai DELETE, jamais
-- un drapeau `removed_at` à filtrer partout où la table est déjà jointe
-- (galerie, revue, export, calcul de `contentHash`, plus d'une dizaine de
-- sites dans task_repository.ts/photo_repository.ts/import_service.ts).
-- Une table SÉPARÉE, clée sur le même couple, garde l'unique note EN
-- ATTENTE d'une resélection — jamais lue par l'export ni par le hash de
-- contenu : inerte PAR CONSTRUCTION (aucun code ne la joint dans ces deux
-- chemins), pas par un filtre à respecter partout ailleurs.
--
-- `note NOT NULL` : rien d'utile à archiver sans note (le retrait d'une
-- image sans note, ou dont la note a été effacée avant retrait, ne crée
-- aucune ligne — voir `archiveRemovedImageNote`, qui SUPPRIME plutôt que
-- d'archiver `NULL`, pour ne jamais laisser une ancienne note traîner après
-- que la courante a été vidée). `ON CONFLICT` réécrit toujours la ligne au
-- retrait le plus récent — jamais un empilement, une ligne par couple.
--
-- Purge : `ON DELETE CASCADE` sur `task_slug`, comme `app.task_image` et
-- `app.task_note` — supprimer la tâche supprime ses notes en attente, aucun
-- code de nettoyage séparé. Au sein d'une tâche vivante, une ligne reste
-- tant que l'image n'est jamais resélectionnée ; borné par le nombre
-- d'images distinctes un jour retirées, jamais illimité.
CREATE TABLE app.task_image_note (
  task_slug      text NOT NULL REFERENCES app.task ON DELETE CASCADE,
  cloud_asset_id char(32) NOT NULL,
  note           text NOT NULL,
  archived_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_slug, cloud_asset_id)
);
