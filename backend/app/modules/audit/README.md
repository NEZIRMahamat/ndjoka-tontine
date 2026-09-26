# Module audit

Historique métier immuable des actions sensibles. Il complète les logs
techniques et les journaux Auth0 sans les remplacer.

## Règles

- Chaque événement suit la convention `<ressource>.<action>` et doit être
  déclaré dans `catalog.py`, avec la liste blanche de ses champs.
- L'événement est écrit dans la transaction de l'action métier : si l'audit
  échoue, l'action est annulée.
- La table est en ajout seul : aucune route ne modifie ni ne supprime un
  événement, et un trigger PostgreSQL refuse tout `UPDATE` ou `DELETE`.
- `changes` n'accepte que les champs déclarés. Tokens, secrets, mots de passe,
  données bancaires, e-mails et `auth0_sub` sont refusés.
- Un événement automatique porte `actor_type=system`.

## Corrélation

Le middleware accepte un en-tête `X-Request-ID` (UUID) ou en génère un. Il est
renvoyé dans la réponse et copié dans chaque événement de la requête.

## Visibilité

| Rôle | Événements visibles |
| --- | --- |
| `owner`, `manager` | Toute la tontine |
| `treasurer` | Événements financiers et ceux qui le concernent |
| `member` | Ceux dont il est acteur ou sujet |
| `platform_admin` | Audit global |

## API

| Méthode | Route |
| --- | --- |
| `GET` | `/api/v1/me/audit-events`, `/api/v1/me/audit-events/{event_id}` |
| `GET` | `/api/v1/tontines/{tontine_id}/audit-events`, `.../{event_id}` |
| `GET` | `/api/v1/admin/audit-events`, `.../{event_id}` |

Filtres : `event_name`, `resource_type`, `resource_id`, `actor_user_id`,
`date_from`, `date_to`. Pagination par curseur stable (`cursor`, `limit` de 1
à 100), du plus récent au plus ancien.
