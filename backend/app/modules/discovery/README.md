# Module discovery

Recommandation des tontines ouvertes selon le profil d'épargnant, et adhésion
directe sans invitation.

## Tontines proposées

Une tontine est proposée si elle est `active`, marquée `is_discoverable`,
non complète et si l'utilisateur n'en est pas déjà membre.

## Score d'affinité

Score entre 0 et 1 calculé dans `matching.py`, accompagné de raisons lisibles
pour chaque critère.

| Critère | Poids | Principe |
| --- | --- | --- |
| Budget | 0.40 | Équivalent mensuel de la cotisation rapporté à la capacité ; optimum à 70 %, dépassement pénalisé |
| Rythme | 0.25 | Fréquence du cycle égale au rythme souhaité |
| Taille | 0.20 | Capacité du groupe dans la fourchette souhaitée |
| Horizon | 0.15 | Durée estimée de la rotation proche de l'horizon d'épargne |

Une cotisation hebdomadaire est ramenée au mois avec un facteur de 4,333.
Sans profil, le score vaut `0.500` et une raison invite à compléter le profil.

Les résultats sont triés par éligibilité puis par affinité décroissante.

## Éligibilité et adhésion

Une tontine est éligible si elle n'exige pas de score minimum, ou si le score
de fiabilité de l'utilisateur atteint `min_reliability_score`.

L'adhésion directe crée une adhésion `member` après avoir vérifié, sous
verrou : tontine ouverte et active, place disponible, absence d'adhésion
existante et score suffisant. Elle est tracée dans l'audit
(`membership.joined_open_tontine`).

## API

| Méthode | Route | Résultat |
| --- | --- | --- |
| `GET` | `/api/v1/discovery/tontines` | Liste classée ; paramètres `search`, `eligible_only`, `limit` (1 à 50), `offset` |
| `POST` | `/api/v1/discovery/tontines/{tontine_id}/join` | Adhésion (`201`) |

Erreurs d'adhésion : `404` tontine introuvable ou privée, `403` score
insuffisant, `409` déjà membre, tontine complète ou non active.
