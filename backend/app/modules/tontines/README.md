# Contrat métier Tontine — Sprint 2

Le module Tontines permet à un utilisateur Ndjoka `active` de créer et gérer
ses propres projets de tontine. Les membres, invitations, cycles, cotisations
et paiements restent hors du Sprint 2.

## Données

| Champ | Règle |
| --- | --- |
| `id` | UUID interne généré par PostgreSQL |
| `name` | Texte nettoyé, obligatoire, de 3 à 120 caractères |
| `description` | Texte facultatif, 5 000 caractères maximum |
| `currency` | Code ISO 4217 sur trois lettres, `EUR` par défaut |
| `max_members` | Entier facultatif, minimum 2 |
| `status` | `draft`, `active` ou `archived` |
| `created_by_user_id` | Clé étrangère vers le créateur Ndjoka |
| `created_at`, `updated_at` | Dates PostgreSQL avec fuseau horaire |
| `archived_at` | Date UTC renseignée uniquement pour une archive |

Une nouvelle tontine est toujours créée en `draft`. Le statut `active` est
réservé à l'activation métier qui arrivera avec les cycles : aucune route du
Sprint 2 ne permet de l'activer directement.

## Propriété et accès

- un compte suspendu ou désactivé reçoit `403` sur toutes les routes Tontines ;
- le créateur reçoit automatiquement une adhésion `owner` ;
- les membres actifs peuvent consulter la tontine ; seules les opérations
  autorisées par leur rôle interne sont modifiables ;
- une ressource absente ou appartenant à un autre utilisateur produit la même
  réponse `404`, afin de ne pas révéler son existence ;
- la liste est limitée aux adhésions actives et accepte `limit`, `offset` et un filtre
  `status` ;
- la clé étrangère empêche la suppression physique du créateur tant que ses
  tontines existent.

## Modifications et transitions

Le propriétaire peut modifier `name`, `description`, `currency` et
`max_members`. Un objet vide produit `400`. Les identifiants, le créateur, le
statut et les dates restent contrôlés par le serveur.

Transitions prises en charge :

```text
draft  ──archive──> archived
active ──archive──> archived
```

L'archivage est logique et répétable : il conserve la ligne et la première
valeur de `archived_at`. Une tontine archivée reste consultable, mais toute
modification produit `409 Conflict`. La devise d'une tontine `active` ne peut
plus changer. Les écritures concurrentes prennent un verrou PostgreSQL sur la
ligne avant de vérifier ces règles.

## API

| Méthode | Route | Résultat |
| --- | --- | --- |
| `POST` | `/api/v1/tontines` | Crée un brouillon (`201`) |
| `GET` | `/api/v1/tontines` | Liste paginée du propriétaire (`200`) |
| `GET` | `/api/v1/tontines/{tontine_id}` | Détail du propriétaire (`200`) |
| `PATCH` | `/api/v1/tontines/{tontine_id}` | Mise à jour contrôlée (`200`) |
| `POST` | `/api/v1/tontines/{tontine_id}/archive` | Archivage logique (`200`) |

Le frontend du Sprint 2 consomme la création et la liste. Les autres opérations
sont disponibles dans l'API et documentées dans Swagger.
