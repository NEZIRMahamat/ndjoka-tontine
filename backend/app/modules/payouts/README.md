# Module payouts

Versement du pot au bénéficiaire de chaque tour. Aucun transfert n'est
exécuté : `declared_paid` est une déclaration, pas une preuve de paiement.

## États

```text
pending -> ready -> approved -> declared_paid -> received
declared_paid -> disputed -> received
pending | ready | approved -> cancelled
```

## Règles

- Un versement par tour, créé à l'activation du cycle.
- `expected_amount` est la somme des cotisations du tour, figée à la
  génération. `available_amount` ne compte que les cotisations `confirmed`.
- `ready` exige toutes les cotisations du tour confirmées, l'échéance atteinte
  et un cycle actif. L'éligibilité est revérifiée à l'approbation et à la
  déclaration.
- L'approbation exige un montant égal au montant attendu et disponible :
  ni paiement partiel, ni dépassement.
- Le passage du temps ne modifie pas l'état stocké : appeler
  `refresh-readiness` (ou `approve`, qui recalcule aussi) après l'échéance.
- Une contestation se résout avec une justification obligatoire.
- L'annulation exige un motif et n'est possible qu'avant paiement.
  L'annulation d'un cycle préserve les versements déjà déclarés payés.
- Références et notes sont libres : n'y saisir aucune donnée bancaire.

## Permissions

| Action | Rôle |
| --- | --- |
| Consulter, recalculer | Tout membre actif |
| Voir références, notes et auteurs | `owner`, `manager`, `treasurer`, bénéficiaire |
| Générer, approuver, résoudre une contestation | `owner`, `manager` |
| Déclarer payé | `owner`, `treasurer` |
| Confirmer la réception, contester | Bénéficiaire uniquement |
| Annuler | `owner` |

## API

Base cycle : `/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/payouts`

| Méthode | Route |
| --- | --- |
| `POST` | base + `/generate` |
| `GET` | base, base + `/summary` |
| `GET` | `/api/v1/me/payouts` |
| `GET` | `/api/v1/payouts/{payout_id}` |
| `POST` | `/api/v1/payouts/{payout_id}/refresh-readiness` |
| `POST` | `/api/v1/payouts/{payout_id}/approve` |
| `POST` | `/api/v1/payouts/{payout_id}/declare-paid` |
| `POST` | `/api/v1/payouts/{payout_id}/confirm-receipt` |
| `POST` | `/api/v1/payouts/{payout_id}/dispute` |
| `POST` | `/api/v1/payouts/{payout_id}/resolve-dispute` |
| `POST` | `/api/v1/payouts/{payout_id}/cancel` |

`/me/payouts` liste les versements dont l'utilisateur est bénéficiaire.
