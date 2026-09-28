/**
 * Contenu éducatif statique sur le fonctionnement des tontines.
 *
 * Ce contenu est générique et pédagogique : il ne fait référence à aucune
 * tontine, aucun membre ni aucune donnée financière réelle de la plateforme.
 * Il complète l'expérience d'exploration lorsque l'utilisateur cherche des
 * repères avant de rejoindre ou de créer un groupe.
 */

export type GuideContentBlock = {
  heading?: string
  body: string
}

export type Guide = {
  id: string
  slug: string
  category: string
  categoryColor: string
  title: string
  excerpt: string
  readMinutes: number
  content: GuideContentBlock[]
}

export const GUIDES: Guide[] = [
  {
    id: 'choisir-premiere-tontine',
    slug: 'choisir-premiere-tontine',
    category: 'Débutant',
    categoryColor: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    title: 'Comment choisir sa première tontine',
    excerpt:
      "La tontine est l'un des mécanismes d'épargne collective les plus anciens et les plus efficaces. Avant de rejoindre votre premier groupe, voici ce qu'il faut savoir.",
    readMinutes: 5,
    content: [
      {
        heading: 'Définir votre objectif',
        body: "Posez-vous d'abord la question : pour quoi épargnez-vous ? Un imprévu, un projet, un achat important ? L'objectif détermine le montant, le rythme et la durée idéale de la tontine à rejoindre.",
      },
      {
        heading: 'Évaluer votre capacité de cotisation',
        body: "Choisissez un montant que vous pouvez tenir sur toute la durée du cycle sans risquer de retard. Mieux vaut cotiser un montant modeste sans jamais manquer un versement, plutôt que de vous engager sur un montant trop élevé.",
      },
      {
        heading: 'Vérifier votre score de fiabilité',
        body: "Sur Ndjoka, chaque groupe peut définir un score de fiabilité minimal pour l'adhésion. Complétez votre profil épargnant afin de connaître votre score et les groupes réellement accessibles.",
      },
      {
        heading: 'Lire les conditions du groupe',
        body: "Chaque tontine affiche sa cotisation, son rythme, le nombre de places disponibles et vos raisons de correspondance. Prenez le temps de les comparer avant de demander à rejoindre un groupe.",
      },
      {
        heading: 'Conclusion',
        body: "La confiance et la régularité sont au cœur d'une tontine réussie. Commencez par un groupe dont les conditions correspondent clairement à votre budget et à votre rythme de vie.",
      },
    ],
  },
  {
    id: 'comprendre-cotisation-cycle',
    slug: 'comprendre-cotisation-cycle',
    category: 'Fonctionnement',
    categoryColor: 'border-blue-200 bg-blue-50 text-blue-700',
    title: 'Comprendre la cotisation et le cycle de versement',
    excerpt:
      "Chaque tontine fonctionne par cycles de cotisation et de versement. Comprendre ce mécanisme vous aide à anticiper vos engagements avant de rejoindre un groupe.",
    readMinutes: 4,
    content: [
      {
        heading: 'Le rythme de cotisation',
        body: "Une tontine se cotise selon un rythme fixe, hebdomadaire ou mensuel. Ce rythme détermine la fréquence de vos versements et celle des tours de bénéficiaire au sein du groupe.",
      },
      {
        heading: "L'équivalent mensuel",
        body: "Pour comparer facilement des tontines à des rythmes différents, Ndjoka calcule un équivalent mensuel de la cotisation. Cela permet d'estimer votre effort d'épargne réel, quel que soit le rythme choisi par le groupe.",
      },
      {
        heading: 'Les places disponibles',
        body: "Le nombre de places restantes reflète la capacité d'accueil du groupe. Une tontine avec peu de places disponibles peut se remplir rapidement : n'hésitez pas à finaliser votre adhésion dès que vous êtes prêt.",
      },
      {
        heading: 'Conclusion',
        body: "Prendre le temps de comprendre le rythme et l'équivalent mensuel d'une tontine évite les mauvaises surprises et vous permet de vous engager en toute connaissance de cause.",
      },
    ],
  },
  {
    id: 'ameliorer-score-fiabilite',
    slug: 'ameliorer-score-fiabilite',
    category: 'Profil',
    categoryColor: 'border-violet-200 bg-violet-50 text-violet-700',
    title: 'Améliorer votre score de fiabilité',
    excerpt:
      "Votre score de fiabilité influence les tontines qui vous sont accessibles et la façon dont elles vous sont recommandées. Voici comment mieux le comprendre.",
    readMinutes: 4,
    content: [
      {
        heading: "À quoi sert le score de fiabilité",
        body: "De nombreux groupes fixent un score de fiabilité minimal pour accepter de nouveaux membres. Ce seuil protège les participants déjà engagés et favorise des cycles de versement respectés par tous.",
      },
      {
        heading: 'Compléter votre profil épargnant',
        body: "Renseigner votre budget, votre rythme de cotisation préféré et vos objectifs permet à Ndjoka de calculer un score d'affinité plus juste entre vous et chaque tontine ouverte, en plus de votre score de fiabilité.",
      },
      {
        heading: 'La régularité avant tout',
        body: "Le meilleur moyen de renforcer votre profil reste la régularité de vos cotisations dans les groupes que vous rejoignez. Un historique de versements tenus est le signal le plus fort de fiabilité.",
      },
      {
        heading: 'Conclusion',
        body: "Un profil complet et un historique régulier ouvrent l'accès à davantage de tontines et améliorent la pertinence des recommandations qui vous sont proposées.",
      },
    ],
  },
  {
    id: 'organiser-tontine-reussie',
    slug: 'organiser-tontine-reussie',
    category: 'Organisateur',
    categoryColor: 'border-amber-200 bg-amber-50 text-amber-700',
    title: "Organiser une tontine qui tient dans la durée",
    excerpt:
      "En tant qu'organisateur, vous portez la responsabilité de la cohésion du groupe. Voici les pratiques qui distinguent les tontines qui vont jusqu'au bout de leur cycle.",
    readMinutes: 5,
    content: [
      {
        heading: 'Fixer des règles claires dès le départ',
        body: "Définissez précisément la cotisation, le rythme, le nombre de membres maximum et, si besoin, un score de fiabilité minimal pour l'adhésion. L'ambiguïté est l'ennemie de la cohésion du groupe.",
      },
      {
        heading: 'Ouvrir le groupe à la découverte',
        body: "Publier une description claire de votre tontine augmente vos chances de trouver des membres dont le profil d'épargne correspond réellement aux conditions du groupe.",
      },
      {
        heading: 'Suivre le remplissage du groupe',
        body: "Gardez un œil sur le nombre de places restantes et sur l'évolution des adhésions. Un groupe qui se remplit progressivement avec des membres engagés part sur de bonnes bases.",
      },
      {
        heading: 'Conclusion',
        body: "Une tontine bien cadrée dès sa création, avec des conditions transparentes, inspire confiance et attire des membres réellement en phase avec le projet du groupe.",
      },
    ],
  },
]

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug)
}

const GUIDE_IMAGES: Record<string, string> = {
  'choisir-premiere-tontine': 'https://images.unsplash.com/photo-1636388951474-d84e2e5bb6a3?auto=format&fit=crop&w=1000&q=80',
  'comprendre-cotisation-cycle': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1000&q=80',
  'ameliorer-score-fiabilite': 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1000&q=80',
  'organiser-tontine-reussie': 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1000&q=80',
}

export function guideImageFor(guide: Guide): string {
  return GUIDE_IMAGES[guide.slug] ?? GUIDE_IMAGES['choisir-premiere-tontine']
}
