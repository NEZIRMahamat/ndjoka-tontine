import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { BookOpen, ChevronRight, Clock, MapPin, Search, SlidersHorizontal, Sparkles, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useNavigate } from 'react-router-dom'

import { ErrorNotice, SkeletonBlock } from '@/components/shared/page-primitives'
import { discoverTontines, type DiscoveredTontine, type DiscoveryResult } from '@/features/explorer/discovery-api'
import { GUIDES, guideImageFor } from '@/features/explorer/guides-content'
import { CATEGORY_META, CATEGORY_ORDER, coverImageFor, frequencyShortLabels } from '@/features/tontines/tontine-presentation'
import type { TontineCategory } from '@/features/tontines/tontines-api'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { cn } from '@/lib/utils'

type CategoryFilter = 'all' | TontineCategory
type FrequencyFilter = 'all' | 'weekly' | 'monthly'
const AMOUNTS = [
  { label: 'Tous', min: 0, max: Infinity },
  { label: '< 100 €', min: 0, max: 99.99 },
  { label: '100 – 300 €', min: 100, max: 300 },
  { label: '> 300 €', min: 300.01, max: Infinity },
]

function tagsFor(tontine: DiscoveredTontine): Array<{ label: string; className: string }> {
  const tags: Array<{ label: string; className: string }> = []
  const affinity = Number(tontine.affinity_score)
  if (affinity >= 0.8) tags.push({ label: 'Recommandé', className: 'bg-emerald-50 text-emerald-700' })
  if (tontine.min_reliability_score) tags.push({ label: 'Membres vérifiés', className: 'bg-violet-50 text-violet-700' })
  const ageDays = (Date.now() - new Date(tontine.created_at).getTime()) / 86_400_000
  if (ageDays < 21) tags.push({ label: 'Nouveau', className: 'bg-blue-50 text-blue-700' })
  if (tontine.seats_left !== null && tontine.seats_left <= 3 && tontine.seats_left > 0) tags.push({ label: 'Dernières places', className: 'bg-amber-50 text-amber-700' })
  if (tontine.contribution_amount && Number(tontine.contribution_amount) >= 300) tags.push({ label: 'Gros montant', className: 'bg-red-50 text-red-700' })
  return tags.slice(0, 2)
}

function TontineCard({ tontine, onClick }: { tontine: DiscoveredTontine; onClick: () => void }) {
  const total = tontine.max_members ?? tontine.member_count
  const fill = total ? Math.round((tontine.member_count / total) * 100) : 0
  const spots = tontine.seats_left
  const category = CATEGORY_META[tontine.category]
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      role="link"
      tabIndex={0}
      onKeyDown={(event) => event.key === 'Enter' && onClick()}
      className="group cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
    >
      <div className="relative h-40 overflow-hidden">
        <img src={coverImageFor(tontine.category, tontine.cover_image_url)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {tagsFor(tontine).map((tag) => <span key={tag.label} className={cn('rounded-md px-2 py-0.5 text-xs font-bold shadow-sm', tag.className)}>{tag.label}</span>)}
        </div>
        {tontine.contribution_amount && (
          <div className="absolute right-2 bottom-2 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow">
            {formatCurrencyAmount(tontine.contribution_amount, tontine.currency)} / {tontine.frequency ? frequencyShortLabels[tontine.frequency] : 'tour'}
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="leading-tight font-bold text-slate-800 transition-colors group-hover:text-emerald-700">{tontine.name}</h3>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', category.chip)}>{category.label}</span>
        </div>
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1"><MapPin size={11} /> {tontine.city ?? 'France'}</span>
          <span className="flex items-center gap-1 font-semibold text-emerald-600"><Sparkles size={11} /> {Math.round(Number(tontine.affinity_score) * 100)}% d'affinité</span>
        </div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1"><Users size={11} /> {tontine.member_count}{tontine.max_members ? `/${tontine.max_members}` : ''} membres</span>
          <span className={cn('font-semibold', spots === null || spots > 0 ? 'text-emerald-600' : 'text-red-500')}>
            {spots === null ? 'Places illimitées' : spots > 0 ? `${spots} place${spots > 1 ? 's' : ''}` : 'Complet'}
          </span>
        </div>
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${fill}%` }} />
        </div>
        <span className="block w-full rounded-lg border border-emerald-600 py-2 text-center text-sm font-semibold text-emerald-600 transition-colors group-hover:bg-emerald-50">Voir les détails</span>
      </div>
    </motion.div>
  )
}

function FilterSidebar({ category, setCategory, frequency, setFrequency, amountIndex, setAmountIndex, hasActiveFilters, resetFilters }: {
  category: CategoryFilter
  setCategory: (value: CategoryFilter) => void
  frequency: FrequencyFilter
  setFrequency: (value: FrequencyFilter) => void
  amountIndex: number
  setAmountIndex: (value: number) => void
  hasActiveFilters: boolean
  resetFilters: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700"><SlidersHorizontal size={15} /> Filtres</h3>
        {hasActiveFilters && <button type="button" onClick={resetFilters} className="flex items-center gap-1 text-xs text-emerald-600 hover:underline"><X size={11} /> Réinitialiser</button>}
      </div>
      <div>
        <p className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Catégorie</p>
        <div className="flex flex-col gap-1">
          {(['all', ...CATEGORY_ORDER.filter((item) => item !== 'other')] as CategoryFilter[]).map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} className={cn('rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors', category === item ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
              {item === 'all' ? 'Tout' : CATEGORY_META[item].label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Fréquence</p>
        <div className="flex flex-col gap-1">
          {([['all', 'Toutes'], ['weekly', 'Hebdomadaire'], ['monthly', 'Mensuelle']] as [FrequencyFilter, string][]).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setFrequency(value)} className={cn('rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors', frequency === value ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100')}>{label}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Cotisation</p>
        <div className="flex flex-col gap-1">
          {AMOUNTS.map((amount, index) => (
            <button key={amount.label} type="button" onClick={() => setAmountIndex(index)} className={cn('rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors', amountIndex === index ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>{amount.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ExplorePage() {
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [frequency, setFrequency] = useState<FrequencyFilter>('all')
  const [amountIndex, setAmountIndex] = useState(0)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const page = await discoverTontines(token, { limit: 50 }, controller.signal)
        if (active) setResult(page)
      } catch (caught) {
        if (active && !controller.signal.aborted) setError(messageOf(caught, 'Impossible de charger les tontines ouvertes.'))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [getAccessTokenSilently, reload])

  const filtered = useMemo(() => {
    const { min, max } = AMOUNTS[amountIndex]
    const needle = search.trim().toLowerCase()
    return (result?.items ?? []).filter((tontine) => {
      const amount = Number(tontine.contribution_amount ?? 0)
      const matchCategory = category === 'all' || tontine.category === category
      const matchFrequency = frequency === 'all' || tontine.frequency === frequency
      const matchAmount = amountIndex === 0 || (amount >= min && amount <= max)
      const haystack = `${tontine.name} ${tontine.description ?? ''} ${tontine.city ?? ''} ${tontine.goal ?? ''}`.toLowerCase()
      return matchCategory && matchFrequency && matchAmount && (!needle || haystack.includes(needle))
    })
  }, [amountIndex, category, frequency, result, search])

  const hasActiveFilters = category !== 'all' || frequency !== 'all' || amountIndex !== 0
  const resetFilters = () => { setCategory('all'); setFrequency('all'); setAmountIndex(0) }

  return (
    <div className="space-y-6">
      {result && !result.has_profile && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 shrink-0 text-violet-600" size={18} />
            <div>
              <p className="text-sm font-bold text-violet-800">Complétez votre profil d'épargnant</p>
              <p className="text-xs text-violet-700">Sept questions suffisent pour classer les tontines selon votre budget, votre rythme et vos objectifs.</p>
            </div>
          </div>
          <Link to="/profile/savings" className="shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">Compléter</Link>
        </div>
      )}

      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher une tontine, un projet, une ville…"
              className="w-full rounded-lg border border-slate-200 py-2.5 pr-4 pl-10 text-sm transition-all focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 focus:outline-none"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button type="button" onClick={() => setMobileFiltersOpen((value) => !value)} className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors lg:hidden', hasActiveFilters ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-600')} aria-label="Filtres">
            <SlidersHorizontal size={15} />
          </button>
        </div>
        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap gap-2">
            {category !== 'all' && <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{CATEGORY_META[category].label} <button type="button" onClick={() => setCategory('all')} aria-label="Retirer le filtre"><X size={10} /></button></span>}
            {frequency !== 'all' && <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{frequency === 'weekly' ? 'Hebdomadaire' : 'Mensuelle'} <button type="button" onClick={() => setFrequency('all')} aria-label="Retirer le filtre"><X size={10} /></button></span>}
            {amountIndex !== 0 && <span className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">{AMOUNTS[amountIndex].label} <button type="button" onClick={() => setAmountIndex(0)} aria-label="Retirer le filtre"><X size={10} /></button></span>}
          </div>
        )}
      </div>

      <AnimatePresence>
        {mobileFiltersOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-xl border border-slate-100 bg-white p-5 shadow-sm lg:hidden">
            <FilterSidebar category={category} setCategory={setCategory} frequency={frequency} setFrequency={setFrequency} amountIndex={amountIndex} setAmountIndex={setAmountIndex} hasActiveFilters={hasActiveFilters} resetFilters={resetFilters} />
          </motion.div>
        )}
      </AnimatePresence>

      {error && <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />}

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              <span className="font-bold text-slate-700">{result ? filtered.length : '…'}</span> tontine{filtered.length !== 1 ? 's' : ''} ouverte{filtered.length !== 1 ? 's' : ''}
              {result?.has_profile && <span className="ml-1 text-xs text-slate-400">· classées par affinité avec votre profil</span>}
            </p>
          </div>
          {!result ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><SkeletonBlock className="h-80" /><SkeletonBlock className="h-80" /><SkeletonBlock className="h-80" /><SkeletonBlock className="h-80" /></div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <Search size={28} className="mx-auto mb-2 text-slate-300" />
              <h3 className="font-bold text-slate-600">Aucune tontine trouvée</h3>
              <p className="mt-1 text-sm text-slate-400">Essayez de modifier vos filtres, ou créez la vôtre.</p>
              <div className="mt-3 flex justify-center gap-3 text-sm">
                {hasActiveFilters && <button type="button" onClick={resetFilters} className="text-emerald-600 hover:underline">Réinitialiser les filtres</button>}
                <Link to="/tontines/create" className="font-semibold text-emerald-600 hover:underline">Créer une tontine</Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {filtered.map((tontine) => <TontineCard key={tontine.id} tontine={tontine} onClick={() => navigate(`/explore/${tontine.id}`)} />)}
            </div>
          )}
        </div>
        <div className="sticky top-4 hidden w-52 shrink-0 rounded-xl border border-slate-100 bg-white p-4 shadow-sm lg:block">
          <FilterSidebar category={category} setCategory={setCategory} frequency={frequency} setFrequency={setFrequency} amountIndex={amountIndex} setAmountIndex={setAmountIndex} hasActiveFilters={hasActiveFilters} resetFilters={resetFilters} />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><BookOpen size={18} className="text-emerald-600" /> Conseils Tontine</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {GUIDES.map((guide) => (
            <Link key={guide.id} to={`/guides/${guide.slug}`} className="group flex overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition-all hover:border-emerald-200 hover:shadow-md">
              <div className="w-28 shrink-0 overflow-hidden">
                <img src={guideImageFor(guide)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
                <div>
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs font-bold', guide.categoryColor)}>{guide.category}</span>
                  <h4 className="mt-2 line-clamp-2 text-sm font-bold text-slate-800 transition-colors group-hover:text-emerald-700">{guide.title}</h4>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-slate-400"><Clock size={11} /> {guide.readMinutes} min</div>
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">Lire <ChevronRight size={11} /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
