# Module payment_methods

Moyens de paiement déclarés par l'utilisateur (carte, prélèvement SEPA,
Mobile Money). Ndjoka ne détient pas les fonds et ne stocke aucune donnée
bancaire : seuls un libellé et les **quatre derniers caractères** de
l'identifiant sont conservés. Le traitement réel des paiements est délégué au
prestataire (Stripe Connect), conformément aux CGU.

## API

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/me/payment-methods` | Lister mes moyens de paiement |
| `POST` | `/me/payment-methods` | Déclarer un moyen (`type`, `label`, `identifier`, `make_default`) |
| `POST` | `/me/payment-methods/{id}/default` | Définir le moyen par défaut |
| `DELETE` | `/me/payment-methods/{id}` | Supprimer |

Le premier moyen déclaré devient automatiquement le moyen par défaut. Au plus
cinq moyens par utilisateur. Chaque mutation écrit un événement d'audit.
