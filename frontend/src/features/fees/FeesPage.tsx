import { useState } from 'react'
import { ArrowLeft, HandCoins, HeartHandshake, Landmark, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { localQuote } from '@/features/fees/fees-api'
import { formatCurrencyAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

const TIERS = [
  { label: "Jusqu'à 100 €", rate: '3 %', detail: 'Carte ou prélèvement SEPA' },
  { label: 'De 101 € à 300 €', rate: '2 %', detail: 'minimum 3 € · Carte ou SEPA' },
  { label: 'Plus de 300 €', rate: '1 %', detail: 'minimum 6 €, plafond 10 € · SEPA uniquement' },
]

const EXAMPLES = [
  { members: 12, amount: 100 },
  { members: 12, amount: 200 },
  { members: 10, amount: 500 },
  { members: 10, amount: 1000 },
]

export default function FeesPage({ standalone = false }: { standalone?: boolean }) {
  const navigate = useNavigate()
  const [amount, setAmount] = useState(100)
  const [members, setMembers] = useState(12)
  const quote = localQuote(amount, members)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button type="button" onClick={() => (standalone ? navigate('/') : navigate(-1))} className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700">
        <ArrowLeft size={15} /> {standalone ? 'Retour à la connexion' : 'Retour'}
      </button>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 px-6 py-8 text-white sm:px-8">
        <div className="absolute -top-16 -right-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl" aria-hidden />
        <div className="relative flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10"><HandCoins size={22} /></span>
          <div>
            <p className="text-[11px] font-bold tracking-[0.13em] text-emerald-300 uppercase">Modèle économique</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Des frais simples, déduits du pot</h1>
            <p className="mt-2 max-w-xl text-sm text-white/75">
              Ndjoka se rémunère par une commission dégressive sur chaque cotisation. Elle est déduite du pot versé au bénéficiaire : chaque membre verse exactement sa cotisation, rien de plus. Ndjoka ne détient jamais l'argent des membres et ne prête jamais d'argent.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3"><h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Le barème</h2></div>
        <div className="divide-y divide-slate-100">
          {TIERS.map((tier) => (
            <div key={tier.label} className="flex items-center justify-between gap-4 px-5 py-4">
              <div><p className="text-sm font-semibold text-slate-700">{tier.label}</p><p className="text-xs text-slate-400">{tier.detail}</p></div>
              <span className="text-2xl font-bold text-emerald-600">{tier.rate}</span>
            </div>
          ))}
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Les minimums garantissent qu'une cotisation plus élevée ne coûte jamais moins cher qu'une plus faible. Le plafond de 10 € évite des frais disproportionnés pour les grosses tontines. Toute évolution du barème est annoncée 30 jours à l'avance et ne s'applique pas aux cycles déjà commencés.</p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold tracking-wider text-slate-500 uppercase">Simulateur</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 flex justify-between text-xs font-semibold text-slate-500"><span>Cotisation par membre</span><span className="text-emerald-700">{formatCurrencyAmount(amount, 'EUR')}</span></span>
            <input type="range" min={10} max={2000} step={10} value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="w-full accent-emerald-600" />
          </label>
          <label className="block">
            <span className="mb-1.5 flex justify-between text-xs font-semibold text-slate-500"><span>Nombre de membres</span><span className="text-emerald-700">{members}</span></span>
            <input type="range" min={2} max={50} value={members} onChange={(event) => setMembers(Number(event.target.value))} className="w-full accent-emerald-600" />
          </label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Pot brut du tour', formatCurrencyAmount(quote.gross, 'EUR'), 'text-slate-800'],
            ['Frais du tour', `− ${formatCurrencyAmount(quote.feeTotal, 'EUR')}`, 'text-slate-500'],
            ['Taux effectif', `${quote.rate.toFixed(1).replace('.', ',')} %`, 'text-slate-500'],
            ['Le bénéficiaire reçoit', formatCurrencyAmount(quote.net, 'EUR'), 'text-emerald-700'],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-400">{label}</p>
              <p className={cn('mt-1 text-lg font-bold', color)}>{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Commission par cotisation : {formatCurrencyAmount(quote.feeUnit, 'EUR')} · dont {formatCurrencyAmount(quote.solidarity, 'EUR')} pour le fonds de solidarité (un sixième).
          {quote.sepaOnly && ' Au-delà de 300 €, seul le prélèvement SEPA est proposé.'}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3"><h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Exemples chiffrés</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-bold tracking-wider text-slate-400 uppercase">
              <tr><th className="px-5 py-2.5">Tontine</th><th className="px-5 py-2.5">Pot du tour</th><th className="px-5 py-2.5">Frais</th><th className="px-5 py-2.5">Taux</th><th className="px-5 py-2.5">Le bénéficiaire reçoit</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {EXAMPLES.map((example) => {
                const row = localQuote(example.amount, example.members)
                return (
                  <tr key={`${example.members}-${example.amount}`}>
                    <td className="px-5 py-3 font-semibold text-slate-700">{example.members} × {formatCurrencyAmount(example.amount, 'EUR')}</td>
                    <td className="px-5 py-3 text-slate-600">{formatCurrencyAmount(row.gross, 'EUR')}</td>
                    <td className="px-5 py-3 text-slate-600">{formatCurrencyAmount(row.feeTotal, 'EUR')}</td>
                    <td className="px-5 py-3 text-slate-600">{row.rate.toFixed(1).replace('.', ',')} %</td>
                    <td className="px-5 py-3 font-bold text-emerald-700">{formatCurrencyAmount(row.net, 'EUR')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Pour 5 000 € sur 10 mois, un prêt personnel coûte environ 270 € d'intérêts, contre 60 € de frais avec Ndjoka : la tontine est plus de quatre fois moins chère.</p>
      </div>

      <div id="fonds-de-solidarite" className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: HeartHandshake, title: 'Fonds de solidarité', text: "Un sixième de chaque commission l'alimente. Si un membre cesse de payer après avoir reçu le pot, le fonds peut compenser, au cas par cas et dans la limite des sommes disponibles, les membres lésés. Ce n'est ni une garantie ni une assurance." },
          { icon: Landmark, title: 'Fonds jamais détenus', text: 'Les paiements passent par un prestataire agréé (Stripe Connect). Les cotisations vont directement au bénéficiaire du tour ; seule la commission revient à Ndjoka.' },
          { icon: ShieldCheck, title: 'Prévention d’abord', text: "Vérification d'identité, prélèvement SEPA recommandé, premiers tours réservés aux membres fiables grâce au score de fiabilité." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Icon size={20} /></div>
            <h3 className="font-bold text-slate-800">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
