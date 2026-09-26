import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { Check, Search, Sparkles, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { messageOf } from '@/lib/http'
import { RHYTHM_LABELS } from '@/features/profile/saver-profile-api'
import {
  discoverTontines,
  joinTontine,
  type DiscoveredTontine,
  type DiscoveryResult,
} from '@/features/explorer/discovery-api'

const PAGE_SIZE = 12

function formatAmount(amount: string | null, currency: string): string {
  if (!amount) return 'Montant à définir'
  const value = Number(amount)
  if (!Number.isFinite(value)) return `${amount} ${currency}`
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
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
}: {
  tontine: DiscoveredTontine
  joining: boolean
  onJoin: (tontine: DiscoveredTontine) => void
}) {
  const affinity = Number(tontine.affinity_score)
  const percent = Math.round(affinity * 100)
  const rhythm = tontine.frequency ? RHYTHM_LABELS[tontine.frequency] : 'Rythme libre'

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
          <Button
            className="w-full"
            disabled={!tontine.is_eligible || joining}
            onClick={() => onJoin(tontine)}
          >
            <UserPlus /> {joining ? 'Adhésion…' : 'Rejoindre'}
          </Button>
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
          { search: debounced, limit: PAGE_SIZE, offset, eligibleOnly },
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
    [debounced, eligibleOnly, getAccessTokenSilently, offset],
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

  const items = result?.items ?? []
  const total = result?.total ?? 0
  const pageInfo = useMemo(() => {
    if (total === 0) return ''
    const from = offset + 1
    const to = Math.min(offset + PAGE_SIZE, total)
    return `${from}–${to} sur ${total}`
  }, [offset, total])

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
            <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={() => navigate('/tontines')}>
              Créer ma tontine
            </Button>
            <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => navigate('/ndjoka-ai')}>
              <Sparkles /> Demander une recommandation
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 bg-card pl-10"
            placeholder="Rechercher une tontine ou un objectif"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
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

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <p className="font-semibold">Aucune tontine ouverte ne correspond</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {debounced
                ? 'Essayez un autre mot-clé, ou désactivez le filtre d’accessibilité.'
                : 'Les organisateurs n’ont pas encore ouvert de groupe public. Créez le vôtre pour lancer le mouvement.'}
            </p>
            <Button className="mt-5" onClick={() => navigate('/tontines')}>Créer une tontine</Button>
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
            {items.map((tontine) => (
              <TontineCard
                key={tontine.id}
                tontine={tontine}
                joining={joiningId === tontine.id}
                onJoin={(target) => void join(target)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
