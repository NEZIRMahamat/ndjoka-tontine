import { ArrowLeft, FileText, Heart, ShieldCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import cguSource from '@/content/legal/cgu.md?raw'
import confidentialiteSource from '@/content/legal/confidentialite.md?raw'
import aProposSource from '@/content/legal/a-propos.md?raw'
import equipeSource from '@/content/legal/equipe.md?raw'
import { MarkdownView } from '@/features/legal/MarkdownView'

export type LegalDocument = 'cgu' | 'confidentialite' | 'a-propos' | 'equipe'

const DOCUMENTS: Record<LegalDocument, { source: string; icon: LucideIcon; eyebrow: string; title: string; intro: string; updated: string }> = {
  cgu: {
    source: cguSource,
    icon: FileText,
    eyebrow: 'Document contractuel',
    title: "Conditions générales d'utilisation",
    intro: "Le cadre d'utilisation de la plateforme, le fonctionnement des tontines, les frais de service et le fonds de solidarité.",
    updated: 'Version en vigueur · septembre 2026',
  },
  confidentialite: {
    source: confidentialiteSource,
    icon: ShieldCheck,
    eyebrow: 'Protection des données',
    title: 'Politique de confidentialité',
    intro: 'Les données que nous collectons, pourquoi, avec qui elles sont partagées et vos droits (RGPD).',
    updated: 'Version en vigueur · septembre 2026',
  },
  'a-propos': {
    source: aProposSource,
    icon: Heart,
    eyebrow: 'Notre mission',
    title: 'À propos de Ndjoka',
    intro: 'Allier la puissance de la solidarité traditionnelle à l’efficacité du numérique.',
    updated: 'Ndjoka · Plateforme de tontine digitale',
  },
  equipe: {
    source: equipeSource,
    icon: Users,
    eyebrow: 'Quatre co-fondateurs',
    title: "L'équipe Ndjoka",
    intro: 'Technologie, finance et stratégie commerciale réunies pour réinventer l’épargne collaborative.',
    updated: 'Paris · 2026',
  },
}

const stripTitle = (source: string) => source.replace(/^#\s.*\n/, '')

export default function LegalPage({ document, standalone = false }: { document: LegalDocument; standalone?: boolean }) {
  const navigate = useNavigate()
  const content = DOCUMENTS[document]
  const Icon = content.icon
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button
        type="button"
        onClick={() => (standalone ? navigate('/') : navigate(-1))}
        className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
      >
        <ArrowLeft size={15} /> {standalone ? 'Retour à la connexion' : 'Retour'}
      </button>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 px-6 py-8 text-white sm:px-8">
        <div className="absolute -top-16 -right-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl" aria-hidden />
        <div className="relative flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10"><Icon size={22} /></span>
          <div>
            <p className="text-[11px] font-bold tracking-[0.13em] text-emerald-300 uppercase">{content.eyebrow}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{content.title}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/75">{content.intro}</p>
            <p className="mt-3 text-xs text-white/50">{content.updated}</p>
          </div>
        </div>
      </div>
      <article className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <MarkdownView source={stripTitle(content.source)} />
      </article>
      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(DOCUMENTS) as LegalDocument[]).filter((key) => key !== document).map((key) => (
          <Link key={key} to={`/${key}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-700">
            {DOCUMENTS[key].title}
          </Link>
        ))}
        <Link to="/frais" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-700">
          Nos frais et le fonds de solidarité
        </Link>
      </div>
    </div>
  )
}
