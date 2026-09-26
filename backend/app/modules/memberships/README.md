# Module memberships

Rôles internes d'une tontine, invitations et cycle de vie des adhésions.

## Rôles internes

| Rôle | Inviter | Gérer les rôles | Retirer | Transférer la propriété |
| --- | --- | --- | --- | --- |
| `owner` | `manager`, `treasurer`, `member` | Oui | Tout membre sauf lui-même | Oui |
| `manager` | `member` uniquement | Non | Membres standards | Non |
| `treasurer` | Non | Non | Non | Non |
| `member` | Non | Non | Non | Non |

Tout membre actif peut consulter la tontine et ses membres. Seuls `owner` et
`manager` voient les invitations.

## Adhésions

- Une paire `(tontine_id, user_id)` est unique.
- États : `active`, puis `left` (départ volontaire) ou `removed` (exclusion).
  Ces deux états sont définitifs et coupent l'accès immédiatement.
- Une tontine a exactement un `owner`, qui ne peut ni partir ni être retiré.
  Il doit d'abord transférer la propriété ; le transfert est atomique.
- Une adhésion directe à une tontine ouverte est gérée par le module discovery.

## Invitations

```text
pending -> accepted | revoked | expired
```

- Une invitation cible un e-mail et expire après 7 jours.
- Le token est retourné une seule fois à la création ; seul son hash SHA-256
  est stocké.
- L'acceptation exige un compte actif portant le même e-mail et vérifie la
  capacité `max_members`.

## API

| Méthode | Route |
| --- | --- |
| `POST`, `GET` | `/api/v1/tontines/{tontine_id}/invitations` |
| `POST` | `/api/v1/tontines/{tontine_id}/invitations/{invitation_id}/revoke` |
| `POST` | `/api/v1/invitations/accept` |
| `GET` | `/api/v1/tontines/{tontine_id}/members` |
| `PATCH` | `/api/v1/tontines/{tontine_id}/members/{user_id}/role` |
| `POST` | `/api/v1/tontines/{tontine_id}/members/{user_id}/remove` |
| `POST` | `/api/v1/tontines/{tontine_id}/members/me/leave` |
| `POST` | `/api/v1/tontines/{tontine_id}/ownership-transfer` |

Un token invalide renvoie `400`.
