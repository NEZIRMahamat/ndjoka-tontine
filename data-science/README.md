# Data Science — Score de fiabilité prédictif

Ce dossier contient la partie Data & IA de Ndjoka Tontine.

## Objectif
Remplacer le score de fiabilité actuel (formule à poids fixes dans
`backend/app/modules/profiles/reliability.py`) par un modèle de machine learning
qui prédit la probabilité qu'une cotisation soit payée en retard ou impayée.

## Contenu
- `ndjoka_ia_fiabilite.ipynb` : génération de données simulées (schéma de la base Ndjoka),
  analyse exploratoire, entraînement (régression logistique, Gradient Boosting),
  comparaison avec la formule actuelle, explicabilité, export du modèle.

## Résultats (données simulées)
| Modèle | AUC globale | AUC nouveaux membres |
|---|---|---|
| Formule actuelle | 0.69 | 0.50 |
| Régression logistique | 0.77 | 0.83 |
| Gradient Boosting | 0.76 | 0.78 |

## Lancer le notebook
Ouvrir le fichier dans Google Colab, puis Exécution > Tout exécuter.
Aucune installation nécessaire.

## Limites
Les données sont simulées faute d'historique réel suffisant. Le pipeline est prêt
à être ré-entraîné sur les tables `contributions`, `saver_profiles` et `cycles`.
