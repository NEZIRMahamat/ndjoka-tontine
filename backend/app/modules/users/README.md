# Module users

Profil local, statut et rôle global des comptes. Auth0 gère l'identité et les
secrets de connexion ; ce module ne stocke ni mot de passe ni token.

## Règles

- `auth0_sub` est l'identité canonique : unique, comparée exactement, immuable.
- Une identité inconnue est provisionnée à la première requête avec
  `status=active` et `global_role=user`. Un `INSERT ... ON CONFLICT DO NOTHING`
  évite les doublons en cas de connexions simultanées.
- L'e-mail est synchronisé depuis le token Auth0 et n'est jamais modifiable
  via l'API.
- Champs modifiables par l'utilisateur : `display_name`, `avatar_url`,
  `locale` (défaut `fr`), `timezone` (défaut `Europe/Paris`).
- La désactivation est logique : la ligne est conservée et `deactivated_at`
  est renseigné.
- Un compte `suspended` ou `deactivated` reçoit `403` sur toutes les routes
  authentifiées.

## Rôles globaux

Ils sont indépendants des rôles internes d'une tontine (module memberships).

| Rôle | Capacités |
| --- | --- |
| `user` | Gérer son propre profil, désactiver son compte |
| `support` | Consulter les utilisateurs en lecture seule |
| `platform_admin` | Modifier le statut et le rôle global d'un autre utilisateur |

Un `platform_admin` ne peut pas modifier son propre statut ni son propre rôle.

## API

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/v1/me` | Compte actif |
| `PATCH` | `/api/v1/me` | Compte actif |
| `POST` | `/api/v1/me/deactivate` | Compte actif |
| `GET` | `/api/v1/admin/users` | `support`, `platform_admin` |
| `GET` | `/api/v1/admin/users/{user_id}` | `support`, `platform_admin` |
| `PATCH` | `/api/v1/admin/users/{user_id}/status` | `platform_admin` |
| `PATCH` | `/api/v1/admin/users/{user_id}/role` | `platform_admin` |

La liste accepte `limit` (1 à 100, défaut 50), `offset` et les filtres
`status` et `global_role`.
