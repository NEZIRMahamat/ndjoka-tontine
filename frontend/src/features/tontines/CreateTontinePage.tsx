import { useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowLeft, ArrowRight, Check, CircleCheck, Coins, Globe2, Loader2, Settings2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrencyAmount } from '@/lib/format'
import { messageOf } from '@/lib/http'
import { createCycle, type CycleFrequency } from '@/features/tontines/cycles-api'
import { createTontine } from '@/features/tontines/tontines-api'

type StepId = 'information' | 'settings' | 'rules' | 'review'

type FormState = {
  name: string
  description: string
  currency: string
  contributionAmount: string
  maxMembers: string
  frequency: CycleFrequency
  startDate: string
  beneficiaryContributes: boolean
  discoverable: boolean
  minScore: string
}

const today = new Date()
const localDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-')

const steps: { id: StepId; title: string; icon: typeof CircleCheck }[] = [
  { id: 'information', title: 'Informations', icon: CircleCheck },
  { id: 'settings', title: 'Paramètres', icon: Coins },
  { id: 'rules', title: 'Règles', icon: Settings2 },
  { id: 'review', title: 'Récapitulatif', icon: Check },
]

const initialForm: FormState = {
  name: '',
  description: '',
  currency: 'EUR',
  contributionAmount: '',
  maxMembers: '',
  frequency: 'monthly',
  startDate: localDate,
  beneficiaryContributes: false,
  discoverable: false,
  minScore: 'none',
}

const reliabilityOptions = [
  { value: 'none', label: 'Ouverte à tous' },
  { value: '0.450', label: 'Score moyen minimum' },
  { value: '0.650', label: 'Bon score minimum' },
  { value: '0.800', label: 'Excellent score minimum' },
]

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function stepErrors(step: StepId, form: FormState): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 'information') {
    if (form.name.trim().length < 3) errors.name = 'Le nom doit contenir au moins 3 caractères.'
    if (form.name.trim().length > 120) errors.name = 'Le nom ne peut pas dépasser 120 caractères.'
    if (form.description.length > 5000) errors.description = 'La description ne peut pas dépasser 5 000 caractères.'
    if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) errors.currency = 'Saisissez un code devise de 3 lettres (EUR, XAF…).'
  }
  if (step === 'settings') {
    const amount = Number(form.contributionAmount)
    if (!Number.isFinite(amount) || amount <= 0) errors.contributionAmount = 'Le montant doit être supérieur à zéro.'
    if (form.maxMembers.trim()) {
      const count = Number(form.maxMembers)
      if (!Number.isInteger(count) || count < 2) errors.maxMembers = 'La capacité doit être un entier supérieur ou égal à 2.'
    }
    if (!form.startDate) errors.startDate = 'Choisissez la date de début du cycle.'
  }
  return errors
}

export default function CreateTontinePage() {
  const { getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<FormState>(initialForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const step = steps[stepIndex]

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function goNext() {
    const found = stepErrors(step.id, form)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setError('')
    setStepIndex((index) => Math.min(steps.length - 1, index + 1))
  }

  async function submit() {
    const allErrors = {
      ...stepErrors('information', form),
      ...stepErrors('settings', form),
    }
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors)
      setStepIndex(Object.keys(stepErrors('information', form)).length > 0 ? 0 : 1)
      return
    }

    setSaving(true)
    setError('')
    try {
      const token = await getAccessTokenSilently()
      const tontine = await createTontine(token, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        currency: form.currency.trim().toUpperCase(),
        max_members: form.maxMembers.trim() ? Number(form.maxMembers) : null,
        is_discoverable: form.discoverable,
        min_reliability_score: form.discoverable && form.minScore !== 'none' ? form.minScore : null,
      })

      try {
        await createCycle(token, tontine.id, {
          name: 'Premier cycle',
          contribution_amount: String(Number(form.contributionAmount)),
          frequency: form.frequency,
          start_date: form.startDate,
          timezone: localTimezone(),
          beneficiary_contributes: form.beneficiaryContributes,
        })
        toast.success(`« ${tontine.name} » et son brouillon de cycle ont été créés.`)
      } catch (caught) {
        const cycleError = messageOf(caught, 'Création du cycle impossible')
        toast.error(`La tontine a été créée, mais pas son cycle : ${cycleError}`)
      }
      navigate(`/tontines/${tontine.id}`)
    } catch (caught) {
      setError(messageOf(caught, 'Création de la tontine impossible'))
    } finally {
      setSaving(false)
    }
  }

  const maxMembers = Number(form.maxMembers)
  const theoreticalPot = Number(form.contributionAmount) * Math.max(
    0,
    maxMembers - (form.beneficiaryContributes ? 0 : 1),
  )
  const reliabilityLabel = reliabilityOptions.find((option) => option.value === form.minScore)?.label

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button
        type="button"
        onClick={() => navigate('/tontines')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Mes Tontines
      </button>

      <header>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Nouveau groupe</p>
        <h2 className="mt-1 text-2xl font-bold text-foreground">Créer une tontine</h2>
        <p className="mt-1 text-sm text-muted-foreground">Configurez votre groupe et son premier cycle en quelques étapes.</p>
      </header>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-5 py-5 sm:px-7">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Configuration du groupe</p>
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {steps.map((item, index) => {
              const Icon = item.icon
              const current = index === stepIndex
              const complete = index < stepIndex
              return (
                <li
                  key={item.id}
                  aria-current={current ? 'step' : undefined}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium sm:text-sm ${
                    current ? 'bg-primary text-primary-foreground' : complete ? 'bg-primary/10 text-primary' : 'bg-background/70 text-muted-foreground'
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/80">
                    {complete ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <span>{item.title}</span>
                </li>
              )
            })}
          </ol>
        </div>

        <CardContent className="space-y-6 pt-6">
          {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

          {step.id === 'information' ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tontine-name">Nom de la tontine *</Label>
                <Input
                  id="tontine-name"
                  value={form.name}
                  maxLength={120}
                  placeholder="Épargne famille"
                  onChange={(event) => update('name', event.target.value)}
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tontine-description">Description et objectif</Label>
                <Textarea
                  id="tontine-description"
                  rows={4}
                  maxLength={5000}
                  value={form.description}
                  placeholder="Décrivez le projet ou les règles communes de votre groupe…"
                  onChange={(event) => update('description', event.target.value)}
                />
                {errors.description ? <p className="text-xs text-destructive">{errors.description}</p> : null}
              </div>
              <div className="space-y-1.5 sm:max-w-44">
                <Label htmlFor="tontine-currency">Devise *</Label>
                <Input
                  id="tontine-currency"
                  value={form.currency}
                  maxLength={3}
                  onChange={(event) => update('currency', event.target.value.toUpperCase())}
                  aria-invalid={Boolean(errors.currency)}
                />
                {errors.currency ? <p className="text-xs text-destructive">{errors.currency}</p> : null}
              </div>
            </div>
          ) : null}

          {step.id === 'settings' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="contribution-amount">Cotisation par tour *</Label>
                <div className="relative">
                  <Input
                    id="contribution-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.contributionAmount}
                    onChange={(event) => update('contributionAmount', event.target.value)}
                    aria-invalid={Boolean(errors.contributionAmount)}
                    className="pr-14"
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{form.currency}</span>
                </div>
                {errors.contributionAmount ? <p className="text-xs text-destructive">{errors.contributionAmount}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-members">Nombre maximum de membres</Label>
                <Input
                  id="max-members"
                  type="number"
                  min={2}
                  step={1}
                  value={form.maxMembers}
                  placeholder="Sans limite"
                  onChange={(event) => update('maxMembers', event.target.value)}
                  aria-invalid={Boolean(errors.maxMembers)}
                />
                {errors.maxMembers ? <p className="text-xs text-destructive">{errors.maxMembers}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cycle-frequency">Fréquence des cotisations *</Label>
                <Select value={form.frequency} onValueChange={(value) => update('frequency', value as CycleFrequency)}>
                  <SelectTrigger id="cycle-frequency"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cycle-start-date">Date de début du cycle *</Label>
                <Input
                  id="cycle-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => update('startDate', event.target.value)}
                  aria-invalid={Boolean(errors.startDate)}
                />
                {errors.startDate ? <p className="text-xs text-destructive">{errors.startDate}</p> : null}
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:col-span-2">
                <Coins className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Le premier cycle sera créé en brouillon. Vous pourrez inviter les membres et générer les tours lorsque le groupe sera prêt.
                </p>
              </div>
            </div>
          ) : null}

          {step.id === 'rules' ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <input
                    id="beneficiary-contributes"
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-primary"
                    checked={form.beneficiaryContributes}
                    onChange={(event) => update('beneficiaryContributes', event.target.checked)}
                  />
                  <Label htmlFor="beneficiary-contributes" className="cursor-pointer">
                    Le bénéficiaire cotise à son propre tour
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {form.beneficiaryContributes
                        ? 'Chaque membre contribue à chaque tour.'
                        : 'Le bénéficiaire est exclu des cotisations de son propre tour.'}
                    </span>
                  </Label>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <input
                    id="tontine-discoverable"
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-primary"
                    checked={form.discoverable}
                    onChange={(event) => update('discoverable', event.target.checked)}
                  />
                  <Label htmlFor="tontine-discoverable" className="cursor-pointer">
                    Rendre le groupe visible dans l’Explorer
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      Sinon, les membres pourront rejoindre le groupe uniquement sur invitation.
                    </span>
                  </Label>
                </div>
                {form.discoverable ? (
                  <div className="space-y-1.5 sm:max-w-md">
                    <Label htmlFor="min-score">Fiabilité minimale du profil</Label>
                    <Select value={form.minScore} onValueChange={(value) => update('minScore', value)}>
                      <SelectTrigger id="min-score"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {reliabilityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                L’ordre des bénéficiaires se configure avec les membres dans l’onglet Cycles. Les échéances sont suivies dans l’application, mais aucune pénalité financière n’est calculée automatiquement.
              </div>
            </div>
          ) : null}

          {step.id === 'review' ? (
            <div className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: 'Nom', value: form.name.trim() },
                  { label: 'Devise', value: form.currency.toUpperCase() },
                  { label: 'Capacité', value: form.maxMembers.trim() ? `${form.maxMembers} membres maximum` : 'Sans limite' },
                  { label: 'Visibilité', value: form.discoverable ? `Explorer · ${reliabilityLabel}` : 'Privée · sur invitation' },
                  { label: 'Cotisation par tour', value: formatCurrencyAmount(form.contributionAmount || '0', form.currency) },
                  { label: 'Fréquence', value: form.frequency === 'weekly' ? 'Hebdomadaire' : 'Mensuelle' },
                  { label: 'Premier tour', value: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${form.startDate}T12:00:00`)) },
                  { label: 'Bénéficiaire cotisant', value: form.beneficiaryContributes ? 'Oui' : 'Non' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-border p-3">
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  {form.maxMembers.trim() && Number.isFinite(theoreticalPot) && theoreticalPot > 0
                    ? `À capacité maximale, la cagnotte théorique par tour serait de ${formatCurrencyAmount(theoreticalPot, form.currency)}. Le montant réel dépendra des membres actifs du cycle.`
                    : 'La cagnotte réelle dépendra du nombre de membres actifs et des cotisations confirmées.'}
                </p>
              </div>
              {form.description.trim() ? (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Description et objectif</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{form.description.trim()}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() =>
                stepIndex === 0
                  ? navigate('/tontines')
                  : setStepIndex((index) => Math.max(0, index - 1))
              }
            >
              <ArrowLeft className="h-4 w-4" /> {stepIndex === 0 ? 'Annuler' : 'Précédent'}
            </Button>
            {step.id === 'review' ? (
              <Button type="button" disabled={saving} onClick={() => void submit()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Créer la tontine
              </Button>
            ) : (
              <Button type="button" onClick={goNext}>
                Suivant <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Les cotisations sont déclarées et vérifiées par les responsables. La création d’un groupe ne déclenche aucun paiement ni transfert.
      </p>
    </div>
  )
}
