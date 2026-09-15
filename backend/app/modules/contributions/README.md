# Contrat métier Cotisations — Sprint 5

Une cotisation est une obligation métier associée à un cycle, un tour et une
adhésion. Elle ne déclenche aucun encaissement réel et ne conserve aucune donnée
bancaire ou secret de paiement.

## Génération et états

L'activation d'un cycle génère les obligations de manière idempotente : `N²`
si le bénéficiaire cotise à son propre tour, sinon `N × (N - 1)`. La paire
`(turn_id, membership_id)` est unique.
Les participants sont ceux du calendrier figé, pas les nouvelles adhésions
ultérieures. Un calendrier planifié dont les membres ont changé est refusé.

```text
pending -> declared -> confirmed
   ^           |
   +-----------+-> rejected -> declared
pending/rejected -> late (état calculé après l'échéance)
pending/declared/rejected -> cancelled (annulation du cycle)
```

`late` n'est pas stocké : il est calculé à la lecture. Une cotisation confirmée
est immuable et reste dans l'historique lors de l'annulation du cycle.

Le membre concerné déclare sa propre cotisation. Owner, manager et treasurer
consultent le suivi collectif et peuvent confirmer ou rejeter une déclaration.
Owner et manager peuvent relancer explicitement la génération idempotente.

## API

- `GET /api/v1/me/contributions` : échéancier personnel filtrable ;
- `GET /api/v1/contributions/{contribution_id}` : détail autorisé ;
- `POST /api/v1/contributions/{id}/declare|confirm|reject` : transitions ;
- `GET /api/v1/tontines/{tontine_id}/cycles/{cycle_id}/contributions` : suivi
  collectif paginé et filtrable ;
- `GET .../contributions/summary` : montants et compteurs agrégés ;
- `POST .../contributions/generate` : génération idempotente.

Une tontine archivée bloque toute écriture. La confirmation actualise le
montant disponible et l'éligibilité du versement dans la même transaction.
Le filtre pending/rejected exclut les retards ; les synthèses utilisent une
agrégation SQL sans limite arbitraire de lignes.
