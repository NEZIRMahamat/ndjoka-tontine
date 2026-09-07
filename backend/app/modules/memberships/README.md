# Contrat Membres et Invitations — Sprint 3

Ce module gère les rôles internes d'une tontine. Ils sont indépendants des
rôles globaux `user`, `support` et `platform_admin`.

## Rôles et autorisations

| Rôle | Lire la tontine et les membres | Inviter | Gérer les rôles | Transférer la propriété | Retirer |
| --- | --- | --- | --- | --- | --- |
| `owner` | oui | `manager`, `treasurer`, `member` | oui, hors `owner` | oui | oui, hors owner |
| `manager` | oui | `member` uniquement | non | non | membres standards |
| `treasurer` | oui | non | non | non | non |
| `member` | oui | non | non | non | non |

Le rôle `owner` ne peut être obtenu que par création de tontine ou transfert
atomique. Une tontine possède exactement un propriétaire actif dans les flux
métier ; un index partiel empêche d'en enregistrer plusieurs.

## Adhésions

Une paire `(tontine_id, user_id)` est unique. Une adhésion commence en
`active`, puis peut devenir `left` après un départ volontaire ou `removed`
après une exclusion. Ces deux états terminaux renseignent `ended_at` et
suppriment immédiatement tout accès à la tontine.

Le propriétaire ne peut ni partir ni être retiré. Il doit d'abord transférer
la propriété à un autre membre actif. Le transfert verrouille la tontine et
les deux adhésions dans une même transaction.

## Invitations

Une invitation cible un e-mail normalisé et expire sept jours après sa
création. Ses transitions sont :

```text
pending ──accept──> accepted
pending ──revoke──> revoked
pending ──expiry──> expired
```

Un token cryptographiquement aléatoire est retourné une seule fois à la
création. Seul son hash SHA-256 est conservé. L'acceptation exige un compte
Ndjoka actif portant le même e-mail, verrouille l'invitation et la tontine,
refuse une adhésion existante et vérifie `max_members` avant l'insertion.

L'envoi réel d'e-mails, les cycles, cotisations et paiements restent hors
périmètre.

## Visibilité et erreurs

- tout membre actif peut consulter la tontine et sa liste de membres ;
- seuls owner et manager peuvent consulter les invitations ;
- une tontine étrangère ou une adhésion inactive produit `404` ;
- une autorisation insuffisante sur une tontine connue produit `403` ;
- un token invalide produit `400`, une transition impossible produit `409` ;
- une tontine archivée conserve ses données en lecture seule.

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
