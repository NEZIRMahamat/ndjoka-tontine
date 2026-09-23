import { ArrowRight, CalendarClock, CircleCheck, Clock3, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function PaymentsPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Pilotage financier</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Paiements</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Retrouvez au même endroit vos cotisations, échéances et versements de tontines.</p></div>
        <Button onClick={() => navigate('/tontines')}><WalletCards /> Voir mes tontines</Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={WalletCards} label="À verser ce mois" value="—" hint="Disponible dès l’activation des cycles" tone="blue" />
        <Metric icon={Clock3} label="En attente" value="—" hint="Aucune échéance calculée" tone="amber" />
        <Metric icon={CircleCheck} label="Historique validé" value="—" hint="Vos opérations apparaîtront ici" tone="green" />
      </div>

      <Card className="border-dashed">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-5 w-5 text-primary" /> Votre calendrier de paiements</CardTitle></CardHeader>
        <CardContent className="flex flex-col items-start gap-5 pb-7 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarClock /></div>
          <div className="flex-1"><p className="font-semibold">Les échéances seront synchronisées avec vos cycles.</p><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Créez ou rejoignez une tontine pour activer le suivi des contributions, des tours et des versements. Chaque opération sera confirmée depuis son espace de groupe.</p></div>
          <Button variant="outline" onClick={() => navigate('/tontines')}>Gérer mes groupes <ArrowRight /></Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ icon: Icon, label, value, hint, tone }: { icon: typeof WalletCards; label: string; value: string; hint: string; tone: 'blue' | 'amber' | 'green' }) {
  const classes = { blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', green: 'bg-emerald-50 text-emerald-600' }
  return <Card><CardContent className="flex items-start justify-between p-5"><div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${classes[tone]}`}><Icon className="h-5 w-5" /></span></CardContent></Card>
}
