# Module contributions

Obligations de cotisation d'un cycle. Une cotisation est déclarative : aucun
encaissement n'est effectué et aucune donnée bancaire n'est stockée.

## Génération

L'activation d'un cycle génère une cotisation par couple (tour, membre), de
façon idempotente : `N x N` si le bénéficiaire cotise à son propre tour,
`N x (N - 1)` sinon. Les participants sont ceux du calendrier figé.

## États

```text
pending -> declared -> confirmed
declared -> rejected -> declared
pending | declared | rejected -> cancelled   (annulation du cycle)
```

- `late` n'est pas stocké : il est calculé à la lecture pour une cotisation
  `pending` ou `rejected` dont l'échéance est passée.
- Une cotisation `confirmed` est immuable.
- La confirmation met à jour le versement du tour dans la même transaction.

## Permissions

- Le membre concerné déclare sa propre cotisation.
- `owner`, `manager` et `treasurer` consultent le suivi collectif, confirment
  ou rejettent.
- `owner` et `manager` peuvent relancer la génération.

## API

| Méthode | Route |
| --- | --- |
| `GET` | `/api/v1/me/contributions` |
| `GET` | `/api/v1/contributions/{contribution_id}` |
| `POST` | `/api/v1/contributions/{contribution_id}/declare` |
| `POST` | `/api/v1/contributions/{contribution_id}/confirm` |
| `POST` | `/api/v1/contributions/{contribution_id}/reject` |
| `GET` | `/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/contributions` |
| `GET` | `/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/contributions/summary` |
| `POST` | `/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/contributions/generate` |
