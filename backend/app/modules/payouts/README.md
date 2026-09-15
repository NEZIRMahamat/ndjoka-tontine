# Versements manuels — Sprint 6 (NDJ-90 à NDJ-107)

Backend uniquement, version cible `0.7.0`. Aucun transfert bancaire n'est
exécuté : `declared_paid` est une déclaration, pas une preuve de paiement.

## Contrat et transitions

Un versement par tour (`UNIQUE(turn_id)`). Les clés étrangères composites
garantissent que la tontine, le cycle, le tour et le bénéficiaire correspondent.
Les montants sont des `Decimal` / `NUMERIC(18,2)`, les dates sont stockées en UTC.

```text
pending -> ready -> approved -> declared_paid -> received
                                    |
                                    +-> disputed -> received
pending / ready / approved -> cancelled
```

- `expected_amount` est la somme des cotisations réellement générées du tour.
  Il est figé à la génération ; les participants sont ceux du calendrier figé.
- `available_amount` totalise uniquement les cotisations `confirmed`.
- `ready` exige toutes les adhésions attendues (pas seulement un compte égal),
  toutes leurs cotisations confirmées, une échéance atteinte et un cycle actif.
- L'approbation exige un montant strictement positif égal au montant attendu
  et disponible. Aucun paiement partiel ni dépassement n'est permis.
- L'éligibilité est revérifiée lors de l'approbation et de la déclaration.
  Un montant nul (un seul participant qui ne cotise pas) reste `pending`.
- Les références et notes sont facultatives et purement déclaratives.
  N'y saisir aucun IBAN, numéro de carte, mot de passe ou secret financier.
- Réception et contestation sont exclusives, après `declared_paid`.
  La résolution requiert une justification (`resolution_note`), conserve la
  contestation initiale et enregistre le responsable, la date et la réception.
- L'annulation exige un motif, est réservée aux états non payés et conserve
  l'approbation antérieure. Aucun endpoint de suppression n'existe.
- Tous les utilisateurs doivent être actifs et membres actifs de la tontine.
  Une tontine archivée est en lecture seule, y compris pour les versements.

## Permissions

| Action | Autorisation |
|---|---|
| Liste, détail, synthèse, recalcul | Tous les membres actifs de la tontine |
| Références, notes et auteurs internes | Owner, manager, treasurer, ou bénéficiaire |
| Générer et approuver | Owner ou manager |
| Déclarer payé | Owner ou treasurer (pas manager) |
| Confirmer réception, contester | Bénéficiaire uniquement, quel que soit son rôle |
| Résoudre | Owner ou manager |
| Annuler | Owner uniquement |

Un simple membre non bénéficiaire reçoit statut, montants et dates, mais les
champs internes sont **absents** du JSON (détail et listes). `/me/payouts`
contient les versements dont l'utilisateur est bénéficiaire, pas ceux qu'il
administre. Hors tontine : `404`; rôle insuffisant : `403`; état/montant
incompatible : `409`; payload invalide : `422`; token absent/invalide : `401`.

## API

Base cycle : `/api/v1/tontines/{tontine_id}/cycles/{cycle_id}/payouts`.

| Méthode | Chemin | Corps |
|---|---|---|
| POST | base + `/generate` | Aucun ; retourne une synthèse |
| GET | base | `limit` 1–100, `offset` ≥ 0, `status` facultatif |
| GET | base + `/summary` | Aucun |
| GET | `/api/v1/me/payouts` | Mêmes filtres/pagination |
| GET | `/api/v1/payouts/{id}` | Aucun |
| POST | `/api/v1/payouts/{id}/refresh-readiness` | Aucun |
| POST | `/api/v1/payouts/{id}/approve` | `{"approved_amount":"100.00"}` |
| POST | `/api/v1/payouts/{id}/declare-paid` | `{"external_reference":"MANUEL-1","payment_note":"Transfert déclaré"}` ou `{}` |
| POST | `/api/v1/payouts/{id}/confirm-receipt` | Aucun |
| POST | `/api/v1/payouts/{id}/dispute` | `{"reason":"Fonds non reçus"}` |
| POST | `/api/v1/payouts/{id}/resolve-dispute` | `{"resolution_note":"Réception vérifiée avec le bénéficiaire"}` |
| POST | `/api/v1/payouts/{id}/cancel` | `{"reason":"Tour annulé avant transfert"}` |

Les POST réussis retournent `200`. Motifs : 3–2000 caractères après nettoyage.
Les schémas refusent les champs supplémentaires ; aucun montant, bénéficiaire
ou statut ne peut être librement modifié.

## Intégration et transactions

L'activation crée cotisations puis versements dans une transaction unique.
Une erreur annule l'activation et les deux générations. Le rattrapage
`/generate` est idempotent pour les cycles actifs/terminés ; il refuse une
matrice de cotisations incomplète et ne recrée pas un versement annulé.

La confirmation d'une cotisation actualise le versement dans la même transaction.
Les écritures prennent les verrous dans l'ordre tontine, cycle, adhésion de
l'acteur, puis cotisation/versement. Le verrou de cycle et l'unicité PostgreSQL
empêchent les doublons, doubles approbations/paiements et mises à jour perdues.

Sans ordonnanceur, le seul passage du temps ne modifie pas un état stocké :
appeler `refresh-readiness` à l'échéance, ou `approve` (qui recalcule aussi).
Les GET et filtres exposent l'état enregistré, sans écriture implicite.
L'annulation du cycle annule ses versements pending/ready/approved, mais
préserve ceux declared_paid/disputed/received. La clôture bloque les nouveaux
paiements ; les déclarations déjà effectuées peuvent encore être reçues ou
contestées/résolues tant que la tontine n'est pas archivée.

La synthèse est une agrégation SQL sans plafond de lignes. Les montants par
statut sont disjoints. `expected_amount` et `available_amount` globaux excluent
les versements annulés ; `cancelled_amount` conserve leur montant attendu.
Le disponible est un total de cotisations confirmées, **pas un solde bancaire** :
il peut inclure les fonds d'un versement déjà reçu.

## Migration et validation

Révision : `e64ca02b8d39`, après `d53b9f1a7c28`. Elle ajoute seulement les
versements et deux contraintes uniques supportant leurs clés étrangères.
Aucun rattrapage métier automatique de données historiques n'est fait par Alembic.

Depuis `backend/`, avec PostgreSQL de test sur 5434 :

```bash
TEST_DATABASE_URL=postgresql+asyncpg://ndjoka_test:ndjoka_test@127.0.0.1:5434/ndjoka_test uv run pytest -q
uv run ruff check . --exclude app/ai
uv run ruff format --check . --exclude app/ai
```

`app/ai` est une expérimentation préexistante hors API et hors Sprint 6 :
ses erreurs Ruff ne sont ni masquées dans la configuration, ni corrigées ici.
Le test de migrations downgrade/upgrade utilise uniquement la base de test
validée par le garde-fou des fixtures. Ne jamais utiliser un downgrade en
production : il supprimerait l'historique des versements.

Pour la mise en ligne : suivre [DEPLOYMENT.md](../../../../DEPLOYMENT.md) et
[infra/README.md](../../../../infra/README.md). Vérifier la cible DATABASE_URL,
sauvegarder, migrer vers head, vérifier `alembic check`, puis redéployer la
même version du backend. Les commandes distantes, tests Auth0 réels et tag
`v0.7.0` restent à effectuer par le mainteneur.

Parcours de recette sans frontend : créer une tontine et deux adhésions,
créer un cycle avec une date atteinte, générer/planifier/activer, déclarer et
confirmer toutes les cotisations du premier tour, vérifier ready, approuver,
déclarer payé, puis confirmer avec le compte bénéficiaire. Tester ensuite
une contestation sur un autre tour et les refus 403/404/409. Ne jamais
envoyer de véritables fonds pour cette recette.

