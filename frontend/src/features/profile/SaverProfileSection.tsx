import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { messageOf } from '@/lib/http'
import {
  BAND_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  GROUP_SIZE_LABELS,
  RHYTHM_LABELS,
  TURN_LABELS,
  getReliability,
  getSaverProfile,
  saveSaverProfile,
  type ContributionRhythm,
  type ExperienceLevel,
  type GroupSizePreference,
  type Reliability,
  type SaverProfile,
  type SaverProfileInput,
  type SavingsGoal,
  type TurnPreference,
} from '@/features/profile/saver-profile-api'

const BAND_TONES: Record<string, string> = {
  excellent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  bon: 'bg-blue-50 text-blue-700 border-blue-200',
  moyen: 'bg-amber-50 text-amber-700 border-amber-200',
  fragile: 'bg-rose-50 text-rose-700 border-rose-200',
}

const BAND_BARS: Record<string, string> = {
  excellent: 'bg-emerald-500',
  bon: 'bg-blue-500',
  moyen: 'bg-amber-500',
  fragile: 'bg-rose-500',
}

const DEFAULTS: SaverProfileInput = {
  monthly_capacity: '150',
  preferred_rhythm: 'monthly',
  savings_goal: 'project',
  horizon_months: 12,
  group_size_preference: 'medium',
  experience_level: 'beginner',
  turn_preference: 'flexible',
}

function options<T extends string>(labels: Record<T, string>) {
  return Object.entries(labels) as [T, string][]
}

function ChoiceField<T extends string>({
  id,
  label,
  hint,
  labels,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  labels: Record<T, string>
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options(labels).map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function ReliabilityPanel({ reliability }: { reliability: Reliability }) {
  const percent = Math.round(Number(reliability.score) * 100)
  const tone = BAND_TONES[reliability.band] ?? BAND_TONES.moyen
  const bar = BAND_BARS[reliability.band] ?? BAND_BARS.moyen

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Confiance</p>
          <CardTitle className="text-base">Mon score de fiabilité</CardTitle>
        </div>
        <Badge variant="outline" className={tone}>
          {BAND_LABELS[reliability.band]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight text-foreground">{percent}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            {reliability.is_provisional ? (
              <span className="ml-auto text-xs font-medium text-amber-600">Provisoire</span>
            ) : null}
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${percent}%` }} />
          </div>
        </div>

        <p className="text-sm leading-6 text-muted-foreground">{reliability.explanation}</p>

        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Réglées à l’heure</dt>
            <dd className="font-semibold text-foreground">
              {reliability.contributions_on_time} / {reliability.contributions_total}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Règlements en retard</dt>
            <dd className="font-semibold text-foreground">{reliability.contributions_late}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Échéances non réglées</dt>
            <dd className="font-semibold text-foreground">{reliability.contributions_outstanding}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cycles terminés</dt>
            <dd className="font-semibold text-foreground">{reliability.cycles_completed}</dd>
          </div>
        </dl>

        <div className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Réglez vos cotisations avant l’échéance et menez vos cycles à terme : votre score progresse
            et vous accédez à davantage de tontines.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function SaverProfileSection() {
  const { getAccessTokenSilently } = useAuth0()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reliability, setReliability] = useState<Reliability | null>(null)
  const [existing, setExisting] = useState<SaverProfile | null>(null)
  const [form, setForm] = useState<SaverProfileInput>(DEFAULTS)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const token = await getAccessTokenSilently()
        const [profile, score] = await Promise.all([
          getSaverProfile(token, controller.signal),
          getReliability(token, controller.signal),
        ])
        if (controller.signal.aborted) return
        setExisting(profile)
        setReliability(score)
        if (profile) {
          setForm({
            monthly_capacity: profile.monthly_capacity,
            preferred_rhythm: profile.preferred_rhythm,
            savings_goal: profile.savings_goal,
            horizon_months: profile.horizon_months,
            group_size_preference: profile.group_size_preference,
            experience_level: profile.experience_level,
            turn_preference: profile.turn_preference,
          })
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(messageOf(caught, 'Chargement impossible'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [getAccessTokenSilently])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      const saved = await saveSaverProfile(token, form)
      setExisting(saved)
      toast.success('Vos préférences d’épargne sont enregistrées.')
    } catch (caught) {
      setError(messageOf(caught, 'Enregistrement impossible'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">Épargne</p>
              <CardTitle className="text-base">Mes préférences d’épargne</CardTitle>
            </div>
            {existing ? null : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                À compléter
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Ces informations servent uniquement à vous proposer les tontines qui vous correspondent.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <fieldset disabled={saving} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="monthly_capacity">Capacité d’épargne mensuelle</Label>
                  <Input
                    id="monthly_capacity"
                    inputMode="decimal"
                    required
                    value={form.monthly_capacity}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, monthly_capacity: event.target.value }))
                    }
                    placeholder="150"
                  />
                  <p className="text-xs text-muted-foreground">Le montant que vous pouvez mettre de côté chaque mois.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="horizon_months">Durée souhaitée (mois)</Label>
                  <Input
                    id="horizon_months"
                    type="number"
                    min={1}
                    max={120}
                    required
                    value={form.horizon_months}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        horizon_months: Number(event.target.value),
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">Sur combien de temps souhaitez-vous épargner ?</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ChoiceField<ContributionRhythm>
                  id="preferred_rhythm"
                  label="Rythme de cotisation"
                  hint="À quelle fréquence préférez-vous cotiser ?"
                  labels={RHYTHM_LABELS}
                  value={form.preferred_rhythm}
                  onChange={(next) => setForm((current) => ({ ...current, preferred_rhythm: next }))}
                />
                <ChoiceField<SavingsGoal>
                  id="savings_goal"
                  label="Objectif principal"
                  hint="Ce que vous financez avec cette épargne."
                  labels={GOAL_LABELS}
                  value={form.savings_goal}
                  onChange={(next) => setForm((current) => ({ ...current, savings_goal: next }))}
                />
                <ChoiceField<GroupSizePreference>
                  id="group_size_preference"
                  label="Taille de groupe"
                  hint="Un petit cercle ou un groupe plus large ?"
                  labels={GROUP_SIZE_LABELS}
                  value={form.group_size_preference}
                  onChange={(next) =>
                    setForm((current) => ({ ...current, group_size_preference: next }))
                  }
                />
                <ChoiceField<ExperienceLevel>
                  id="experience_level"
                  label="Mon expérience"
                  hint="Pour adapter l’accompagnement."
                  labels={EXPERIENCE_LABELS}
                  value={form.experience_level}
                  onChange={(next) => setForm((current) => ({ ...current, experience_level: next }))}
                />
                <ChoiceField<TurnPreference>
                  id="turn_preference"
                  label="Position dans le cycle"
                  hint="Quand souhaitez-vous recevoir la cagnotte ?"
                  labels={TURN_LABELS}
                  value={form.turn_preference}
                  onChange={(next) => setForm((current) => ({ ...current, turn_preference: next }))}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Enregistrement…' : existing ? 'Mettre à jour' : 'Enregistrer mes préférences'}
                </Button>
                {existing ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Dernière mise à jour le{' '}
                    {new Date(existing.updated_at).toLocaleDateString('fr-FR')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Sept réponses suffisent pour recevoir des propositions
                  </span>
                )}
              </div>
            </fieldset>
          </form>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {reliability ? <ReliabilityPanel reliability={reliability} /> : null}
    </div>
  )
}
