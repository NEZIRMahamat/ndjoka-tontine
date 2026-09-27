import { useCallback, useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Check, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { messageOf } from '@/lib/http'
import { RHYTHM_LABELS } from '@/features/profile/saver-profile-api'
import { getDiscoveredTontine, joinTontine, type DiscoveredTontine } from '@/features/explorer/discovery-api'
import { formatCurrencyAmount } from '@/lib/format'

function formatAmount(amount: string | null, currency: string): string {
  if (!amount) return 'Montant à définir'
  return formatCurrencyAmount(amount, currency)
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function affinityTone(score: number): string {
  if (score >= 0.75) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (score >= 0.5) return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

export default function ExplorerTontineDetailPage() {
  const { tontineId } = useParams<{ tontineId: string }>()
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()

  const [tontine, setTontine] = useState<DiscoveredTontine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!tontineId) return
    setLoading(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      const found = await getDiscoveredTontine(token, tontineId, signal)
      if (!signal?.aborted) setTontine(found)
    } catch (caught) {
      if (!signal?.aborted) setError(messageOf(caught, 'Impossible de charger cette tontine'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [getAccessTokenSilently, tontineId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function join() {
    if (!tontine) return
    setJoining(true)
    try {
      const token = await getAccessTokenSilently()
      await joinTontine(token, tontine.id)
      toast.success(`Bienvenue dans « ${tontine.name} »`)
      navigate(`/tontines/${tontine.id}`)
    } catch (caught) {
      toast.error(messageOf(caught, 'Adhésion impossible'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button
        type="button"
        onClick={() => navigate('/explorer')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Explorer
      </button>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : error || !tontine ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 p-10 text-center">
            <p className="font-semibold">{error || 'Tontine introuvable.'}</p>
            <Button variant="outline" onClick={() => navigate('/explorer')}>
              Retour à l’exploration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <header className="rounded-3xl bg-[linear-gradient(120deg,#166534,#1da35a)] p-6 text-white shadow-lg shadow-emerald-900/10 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-emerald-100 uppercase">
                  Tontine ouverte
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{tontine.name}</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/90">
                  {tontine.description ?? 'Aucune description fournie par l’organisateur.'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border bg-white px-3 py-1.5 text-sm font-bold ${affinityTone(Number(tontine.affinity_score))}`}
              >
                {Math.round(Number(tontine.affinity_score) * 100)}% d’affinité
              </span>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    label: 'Cotisation',
                    value: formatAmount(tontine.contribution_amount, tontine.currency),
                  },
                  {
                    label: 'Équivalent mensuel',
                    value: formatAmount(tontine.monthly_equivalent, tontine.currency),
                  },
                  {
                    label: 'Rythme',
                    value: tontine.frequency ? RHYTHM_LABELS[tontine.frequency] : 'Libre',
                  },
                  {
                    label: 'Membres',
                    value:
                      tontine.max_members !== null
                        ? `${tontine.member_count} / ${tontine.max_members}`
                        : `${tontine.member_count}`,
                  },
                ].map((stat) => (
                  <Card key={stat.label}>
                    <CardContent className="p-3.5 text-center">
                      <p className="text-sm font-bold text-foreground">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pourquoi cette tontine vous correspond</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {tontine.reasons.map((reason) => (
                      <li key={reason.criterion} className="flex items-start gap-2.5 text-sm">
                        {reason.matched ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className={reason.matched ? 'text-foreground' : 'text-muted-foreground'}>
                          {reason.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                  <Users className="h-4 w-4 shrink-0" />
                  <span>
                    {tontine.member_count} membre{tontine.member_count > 1 ? 's' : ''} déjà inscrit
                    {tontine.member_count > 1 ? 's' : ''}
                    {tontine.seats_left !== null
                      ? ` · ${tontine.seats_left} place${tontine.seats_left > 1 ? 's' : ''} disponible${tontine.seats_left > 1 ? 's' : ''}`
                      : ''}
                  </span>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>Groupe créé le {formatDate(tontine.created_at)}</span>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="sticky top-4">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <p className="text-xs text-muted-foreground">Cotisation</p>
                    <p className="text-2xl font-bold text-foreground">
                      {formatAmount(tontine.contribution_amount, tontine.currency)}
                    </p>
                    {tontine.frequency ? (
                      <p className="text-sm text-muted-foreground">{RHYTHM_LABELS[tontine.frequency]}</p>
                    ) : null}
                  </div>

                  {tontine.is_eligible ? null : (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      {tontine.ineligibility_reason ?? 'Conditions d’accès non remplies pour le moment.'}
                    </p>
                  )}

                  <Button className="w-full" disabled={!tontine.is_eligible || joining} onClick={() => void join()}>
                    <UserPlus /> {joining ? 'Adhésion…' : 'Demander à rejoindre'}
                  </Button>
                  {tontine.is_eligible ? (
                    <p className="text-center text-xs text-muted-foreground">Aucun engagement avant validation</p>
                  ) : null}
                </CardContent>
              </Card>

              {tontine.min_reliability_score !== null ? (
                <Card>
                  <CardContent className="flex items-center gap-3 p-5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Score de fiabilité minimal requis</p>
                      <p className="text-sm font-semibold text-foreground">
                        {tontine.min_reliability_score}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground">Devise du groupe</p>
                  <Badge variant="secondary" className="mt-1">
                    {tontine.currency}
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
