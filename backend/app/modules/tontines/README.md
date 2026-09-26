# Module tontines

Création, modification, visibilité et archivage des tontines.

## Données

| Champ | Règle |
| --- | --- |
| `name` | 3 à 120 caractères |
| `description` | Facultative, 5 000 caractères maximum |
| `currency` | Code ISO 4217, `EUR` par défaut ; figée une fois la tontine active |
| `max_members` | Facultatif, minimum 2 |
| `status` | `draft`, `active` ou `archived` |
| `is_discoverable` | Visible dans l'Explorer ; `false` par défaut |
| `min_reliability_score` | Score de fiabilité minimum exigé à l'adhésion (0 à 1), facultatif |

## Règles

- Une tontine est créée en `draft` et son créateur reçoit l'adhésion `owner`.
- Elle passe en `active` à l'activation de son premier cycle ; aucune route
  ne permet de changer le statut directement.
- L'archivage est logique : la tontine reste consultable mais toute écriture
  renvoie `409`.
- Seuls les membres actifs voient la tontine. Une tontine inaccessible
  renvoie `404` pour ne pas révéler son existence.
- Les écritures verrouillent la ligne avant de vérifier les règles.

## API

| Méthode | Route | Résultat |
| --- | --- | --- |
| `POST` | `/api/v1/tontines` | Création en brouillon |
| `GET` | `/api/v1/tontines` | Tontines dont le compte est membre actif |
| `GET` | `/api/v1/tontines/{tontine_id}` | Détail |
| `PATCH` | `/api/v1/tontines/{tontine_id}` | Modification |
| `POST` | `/api/v1/tontines/{tontine_id}/archive` | Archivage |

La liste accepte `limit`, `offset` et un filtre `status`.
