# Frontend Ndjoka Tontine

Application web React de Ndjoka Tontine. La connexion passe par Auth0 ;
l'Access Token obtenu est transmis à l'API FastAPI pour chaque appel protégé.

## Stack

- React 19, TypeScript, Vite
- Tailwind CSS v4 et composants shadcn/ui (Radix)
- Auth0 React SDK, React Router
- oxlint

## Prérequis

Node.js `^20.19.0` ou `>=22.12.0` (version fixée dans `.nvmrc`), npm 10+.

## Démarrage local

```bash
nvm use
npm install
cp .env.example .env.dev      # puis compléter les valeurs
npm run dev
```

L'application est servie sur `http://localhost:5173`.

## Configuration

| Variable | Rôle |
| --- | --- |
| `VITE_AUTH0_DOMAIN` | Domaine du tenant Auth0 |
| `VITE_AUTH0_CLIENT_ID` | Client ID de l'application Auth0 (Single Page Application) |
| `VITE_AUTH0_AUDIENCE` | Identifier de la Custom API Auth0 |
| `VITE_API_BASE_URL` | URL de l'API backend |

`npm run dev` charge `.env.dev`, `npm run build` charge `.env.prod`. Ces
fichiers ne sont pas versionnés. Les variables `VITE_*` sont publiques car
incluses dans le bundle : n'y placer aucun secret.

Dans Auth0, chaque origine utilisée (par exemple `http://localhost:5173`) doit
figurer dans **Allowed Callback URLs**, **Allowed Logout URLs** et
**Allowed Web Origins**.

## Structure

```text
src/
  app/          routage, layout, fournisseur Auth0, utilisateur courant
  components/
    layout/     barre latérale et barre supérieure
    shared/     composants transverses (confirmation, états vides, badges)
    ui/         primitives shadcn/ui
  features/     un dossier par écran, avec sa page et son client API
  lib/          client HTTP commun et utilitaires
```

| Feature | Écran |
| --- | --- |
| `dashboard` | Accueil |
| `explorer` | Tontines ouvertes recommandées et adhésion |
| `tontines` | Mes tontines, création, espace de gestion d'une tontine |
| `payments` | Vue des paiements (pas encore reliée à l'API) |
| `ai` | Assistant Ndjoka AI |
| `profile` | Compte, profil d'épargnant et score de fiabilité |
| `admin` | Administration des utilisateurs (rôles `support` et `platform_admin`) |

Chaque client API valide les réponses avec des type guards avant de les
utiliser. Les requêtes passent par `apiRequest` (`src/lib/http.ts`).

## Vérifications

```bash
npm run lint
npm run build
```

`npm run build` exécute la vérification TypeScript complète : c'est la même
commande que celle de Vercel.

## Déploiement

Vercel, avec `frontend` comme répertoire racine, `npm run build` comme
commande de build et `dist` comme sortie. Les quatre variables `VITE_*` sont à
définir dans l'environnement Production.

L'authentification ne fonctionne que sur les domaines déclarés dans Auth0.
Utiliser le domaine de production (`https://app.ndjoka-tontine.com`) plutôt
que les URL générées par Vercel pour chaque déploiement.

Configuration Vercel et Auth0 complète : [README racine](../README.md#production).
