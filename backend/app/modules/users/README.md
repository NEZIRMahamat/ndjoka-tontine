# Contrat métier du module utilisateurs

Ce document fixe le contrat du module `users` pour la version 0.2.0. Auth0
reste le fournisseur d'identité et PostgreSQL porte uniquement le profil et
les autorisations métier globales de Ndjoka.

## Responsabilités

- **Auth0** authentifie l'utilisateur, conserve ses secrets de connexion et
  émet l'Access Token. Le claim `sub` est l'identité externe canonique.
- **FastAPI** valide le JWT Auth0, provisionne ou retrouve l'utilisateur local,
  applique les règles d'accès et expose les routes de profil et
  d'administration.
- **PostgreSQL** conserve le profil Ndjoka, le statut du compte et son rôle
  global. Il ne conserve ni mot de passe, ni Access Token, ni Refresh Token.

`auth0_sub` est unique, obligatoire, comparé exactement tel qu'il est reçu et
immuable après la création. L'e-mail est alimenté par Auth0 lorsqu'il est
présent dans l'Access Token ; il est en lecture seule dans l'API Ndjoka.

## Entité `User`

| Champ | Type | Règle |
| --- | --- | --- |
| `id` | UUID | Clé primaire générée par PostgreSQL |
| `auth0_sub` | chaîne, 255 max. | Unique, obligatoire et immuable |
| `email` | chaîne ou `null` | Fourni et synchronisé par Auth0, jamais modifiable par le profil |
| `display_name` | chaîne ou `null` | Nom d'affichage modifiable par l'utilisateur |
| `avatar_url` | URL HTTP(S) ou `null` | Avatar modifiable par l'utilisateur |
| `locale` | chaîne | Valeur initiale `fr` |
| `timezone` | chaîne IANA | Valeur initiale `Europe/Paris` |
| `status` | enum | `active`, `suspended` ou `deactivated` |
| `global_role` | enum | `user`, `support` ou `platform_admin` |
| `created_at` | date-heure UTC | Date de création |
| `updated_at` | date-heure UTC | Date de dernière modification |
| `deactivated_at` | date-heure UTC ou `null` | Renseignée lors d'une désactivation logique et conservée comme historique après réactivation |

Un nouvel utilisateur est créé avec `status=active` et
`global_role=user`. La désactivation est logique : la ligne n'est jamais
supprimée. Un compte `suspended` ou `deactivated`, même muni d'un JWT valide,
est refusé avec le statut HTTP `403`.

Chaque passage vers `deactivated` remplace `deactivated_at` par la date UTC de
cette désactivation. Si un `platform_admin` réactive ou suspend ensuite le
compte, cette date reste renseignée comme historique. La contrainte SQL impose
seulement une date non nulle tant que le statut courant est `deactivated`.

La migration depuis le premier schéma applique une conversion conservatrice :
`pending` devient `suspended` et `closed` devient `deactivated`. Elle renseigne
`deactivated_at` pour les anciens comptes fermés.

## Rôles globaux

| Rôle | Capacités |
| --- | --- |
| `user` | Lire et modifier les champs autorisés de son propre profil ; désactiver son compte |
| `support` | Capacités de `user` et consultation en lecture seule des utilisateurs |
| `platform_admin` | Capacités de `support`, changement du statut et du rôle global d'un autre utilisateur |

Les rôles propres à une tontine (président, trésorier, membre, etc.)
n'appartiennent pas à ce module et seront définis avec les tontines. Cette
version ne met pas en place un moteur générique de permissions.

## API

Toutes les routes ci-dessous requièrent un Bearer Token Auth0 valide :

- `GET /api/v1/me` retourne le profil local courant ;
- `PATCH /api/v1/me` modifie uniquement `display_name`, `avatar_url`, `locale`
  et `timezone` ;
- `POST /api/v1/me/deactivate` désactive logiquement le compte courant ;
- `GET /api/v1/admin/users` liste les utilisateurs pour `support` et
  `platform_admin`, avec pagination `limit`/`offset` et filtres de statut et de
  rôle ;
- `GET /api/v1/admin/users/{user_id}` retourne un utilisateur pour `support`
  et `platform_admin` ;
- `PATCH /api/v1/admin/users/{user_id}/status` est réservé à
  `platform_admin` ;
- `PATCH /api/v1/admin/users/{user_id}/role` est réservé à
  `platform_admin`.

La liste est ordonnée de manière stable. Elle accepte `limit` (de 1 à 100,
valeur initiale 50), `offset` (positif ou nul, valeur initiale 0) et les filtres
optionnels `status` et `global_role`. La réponse contient `items`, `total`,
`limit` et `offset`.

Une identité inconnue renvoie `404`. Une requête sans authentification valide
renvoie `401`, une identité sans droit ou un compte non actif renvoie `403`, et
une charge utile invalide renvoie `422`. Un `platform_admin` ne peut pas
modifier son propre rôle ou son propre statut : cette tentative renvoie aussi
`403` afin d'éviter l'auto-rétrogradation ou l'auto-blocage administratif.

Les schémas d'écriture rejettent les champs supplémentaires. Un utilisateur ne
peut donc modifier ni `email`, ni `auth0_sub`, ni `status`, ni `global_role` via
la route de profil.

## Données volontairement exclues

Ce contrat ne contient pas de mot de passe, secret Auth0, token, téléphone,
adresse, document KYC, compte bancaire, moyen de paiement ou rôle de tontine.
Ces sujets seront introduits uniquement par des tickets métier dédiés.
