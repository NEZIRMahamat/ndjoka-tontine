import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Check, ChevronRight, Clock, Search, Sparkles, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { messageOf } from '@/lib/http'
import { formatCurrencyAmount } from '@/lib/format'
import { RHYTHM_LABELS, type ContributionRhythm } from '@/features/profile/saver-profile-api'
import {
  discoverTontines,
  joinTontine,
  type DiscoveredTontine,
  type DiscoveryResult,
} from '@/features/explorer/discovery-api'
import { GUIDES } from '@/features/explorer/guides-content'

const PAGE_SIZE = 12

type RhythmFilter = 'all' | ContributionRhythm

function formatAmount(amount: string | null, currency: string): string {
  if (!amount) return 'Montant à définir'
  return formatCurrencyAmount(amount, currency)
}

function affinityTone(score: number): string {
  if (score >= 0.75) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (score >= 0.5) return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function TontineCard({
  tontine,
  joining,
  onJoin,
  onViewDetails,
}: {
  tontine: DiscoveredTontine
  joining: boolean
  onJoin: (tontine: DiscoveredTontine) => void
  onViewDetails: (tontine: DiscoveredTontine) => void
}) {
  const affinity = Number(tontine.affinity_score)
  const percent = Math.round(affinity * 100)
  const rhythm = tontine.frequency ? RHYTHM_LABELS[tontine.frequency] : 'Rythme libre'
  const fillPercent =
    tontine.max_members && tontine.max_members > 0
      ? Math.min(100, Math.round((tontine.member_count / tontine.max_members) * 100))
      : null

  return (
    <Card className="flex flex-col transition-shadow hover:shadow-md">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-6">{tontine.name}</CardTitle>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${affinityTone(affinity)}`}
            title="Correspondance avec votre profil d’épargne"
          >
            {percent}%
          </span>
        </div>
        <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
          {tontine.description ?? 'Aucune description fournie par l’organisateur.'}
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Cotisation</p>
            <p className="font-semibold text-foreground">
              {formatAmount(tontine.contribution_amount, tontine.currency)}
            </p>
            <p className="text-xs text-muted-foreground">{rhythm}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Équivalent mensuel</p>
            <p className="font-semibold text-foreground">
              {formatAmount(tontine.monthly_equivalent, tontine.currency)}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {tontine.member_count} membre{tontine.member_count > 1 ? 's' : ''}
              {tontine.seats_left !== null ? ` · ${tontine.seats_left} place(s)` : ''}
            </p>
          </div>
        </div>

        {fillPercent !== null ? (
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${fillPercent}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Groupe rempli à {fillPercent}%</p>
          </div>
        ) : null}

        <ul className="space-y-1.5">
          {tontine.reasons.slice(0, 4).map((reason) => (
            <li key={reason.criterion} className="flex items-start gap-2 text-xs leading-5">
              {reason.matched ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className={reason.matched ? 'text-foreground' : 'text-muted-foreground'}>
                {reason.label}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-2 pt-2">
          {tontine.is_eligible ? null : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              {tontine.ineligibility_reason ?? 'Conditions d’accès non remplies pour le moment.'}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onViewDetails(tontine)}>
              Voir les détails
            </Button>
            <Button
              className="flex-1"
              disabled={!tontine.is_eligible || joining}
              onClick={() => onJoin(tontine)}
            >
              <UserPlus /> {joining ? 'Adhésion…' : 'Rejoindre'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ExplorerPage() {
  const { getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [eligibleOnly, setEligibleOnly] = useState(false)
  const [rhythmFilter, setRhythmFilter] = useState<RhythmFilter>('all')
  const [offset, setOffset] = useState(0)
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joiningId, setJoiningId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search)
      setOffset(0)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError('')
      try {
        const token = await getAccessTokenSilently()
        const page = await discoverTontines(
          token,
          { search: debounced, frequency: rhythmFilter === 'all' ? undefined : rhythmFilter, limit: PAGE_SIZE, offset, eligibleOnly },
          signal,
        )
        if (!signal?.aborted) setResult(page)
      } catch (caught) {
        if (signal?.aborted) return
        setError(messageOf(caught, 'Impossible de charger les tontines ouvertes'))
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [debounced, eligibleOnly, getAccessTokenSilently, offset, rhythmFilter],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function join(tontine: DiscoveredTontine) {
    setJoiningId(tontine.id)
    try {
      const token = await getAccessTokenSilently()
      await joinTontine(token, tontine.id)
      toast.success(`Bienvenue dans « ${tontine.name} »`)
      navigate(`/tontines/${tontine.id}`)
    } catch (caught) {
      toast.error(messageOf(caught, 'Adhésion impossible'))
      void load()
    } finally {
      setJoiningId(null)
    }
  }

  function viewDetails(tontine: DiscoveredTontine) {
    navigate(`/explorer/${tontine.id}`, { state: { tontine } })
  }

  const items = result?.items ?? []
  const total = result?.total ?? 0
  const visibleItems = items

  const pageInfo = useMemo(() => {
    if (total === 0) return ''
    const from = offset + 1
    const to = Math.min(offset + PAGE_SIZE, total)
    return `${from}–${to} sur ${total}`
  }, [offset, total])

  const hasRhythmFilter = rhythmFilter !== 'all'

  return (
    <div className="space-y-8">
      <header className="rounded-3xl bg-[linear-gradient(120deg,#166534,#1da35a)] p-6 text-white shadow-lg shadow-emerald-900/10 sm:p-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-100 uppercase">Explorer</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Trouvez la tontine faite pour vous.</h2>
          <p className="mt-3 text-sm leading-6 text-emerald-50/90">
            Les groupes ouverts sont classés selon votre capacité d’épargne, votre rythme et vos objectifs.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={() => navigate('/tontines/create')}>
              Créer ma tontine
            </Button>
            <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => navigate('/ndjoka-ai')}>
              <Sparkles /> Demander une recommandation
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 bg-card pl-10"
            placeholder="Rechercher une tontine ou un objectif"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          value={rhythmFilter}
          onValueChange={(value) => {
            if (value === 'all' || value === 'weekly' || value === 'monthly') {
              setRhythmFilter(value)
              setOffset(0)
            }
          }}
        >
          <SelectTrigger className="h-11 w-full sm:w-44">
            <SelectValue placeholder="Rythme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rythmes</SelectItem>
            {Object.entries(RHYTHM_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={eligibleOnly ? 'default' : 'outline'}
          className="h-11"
          onClick={() => {
            setEligibleOnly((current) => !current)
            setOffset(0)
          }}
        >
          <Check /> Accessibles uniquement
        </Button>
      </div>

      {hasRhythmFilter ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {RHYTHM_LABELS[rhythmFilter]}
            <button type="button" onClick={() => { setRhythmFilter('all'); setOffset(0) }} aria-label="Retirer le filtre de rythme">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      ) : null}

      {result && !result.has_profile ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Affinez vos recommandations</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Renseignez votre profil d’épargne pour que les tontines soient classées selon votre budget et votre rythme.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/profile')}>
              Compléter mon profil
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void load()}>Réessayer</Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? null : loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : visibleItems.length === 0 && !error ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <p className="font-semibold">Aucune tontine ouverte ne correspond</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {debounced || hasRhythmFilter
                ? 'Essayez un autre mot-clé, un autre rythme, ou désactivez le filtre d’accessibilité.'
                : 'Les organisateurs n’ont pas encore ouvert de groupe public. Créez le vôtre pour lancer le mouvement.'}
            </p>
            <Button className="mt-5" onClick={() => navigate('/tontines/create')}>Créer une tontine</Button>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{pageInfo}</Badge>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
              >
                Suivant
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((tontine) => (
              <TontineCard
                key={tontine.id}
                tontine={tontine}
                joining={joiningId === tontine.id}
                onJoin={(target) => void join(target)}
                onViewDetails={viewDetails}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <BookOpen className="h-5 w-5 text-emerald-600" /> Conseils Tontine
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {GUIDES.slice(0, 4).map((guide) => (
            <Link
              key={guide.id}
              to={`/explorer/guides/${guide.slug}`}
              className="group flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
            >
              <div className="min-w-0">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${guide.categoryColor}`}>
                  {guide.category}
                </span>
                <p className="mt-2 truncate text-sm font-semibold text-foreground group-hover:text-emerald-700">
                  {guide.title}
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {guide.readMinutes} min de lecture
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-emerald-600">
                Lire <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
