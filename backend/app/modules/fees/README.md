# Module fees

Barème de commission Ndjoka, issu du modèle économique retenu.

| Cotisation | Commission par cotisation | Moyens de paiement |
| --- | --- | --- |
| Jusqu'à 100 € | 3 % | Carte ou SEPA |
| De 101 € à 300 € | 2 %, minimum 3 € | Carte ou SEPA |
| Plus de 300 € | 1 %, minimum 6 €, plafond 10 € | SEPA uniquement |

Les frais d'un tour valent la commission unitaire multipliée par le nombre de
cotisations. Ils sont **déduits du pot versé au bénéficiaire** ; un sixième
alimente le fonds de solidarité. `pricing.py` contient le calcul pur (Decimal,
arrondi au centime) ; il est réutilisé par les versements (`payouts`) pour
afficher le montant net et par l'assistant Ndjoka AI pour les simulations.

## API

- `GET /api/v1/fees/schedule` : barème et règles d'évolution (préavis 30 jours).
- `GET /api/v1/fees/quote?contribution_amount=100&members=12` : devis d'un tour.
