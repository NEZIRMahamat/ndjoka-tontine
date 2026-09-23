import { Compass, Filter, Search, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const ideas = [
  { title: 'Tontines solidaires', description: 'Des groupes à taille humaine pour épargner avec des proches.', icon: Users, tone: 'bg-emerald-50 text-emerald-600' },
  { title: 'Objectifs projets', description: 'Structurez une épargne dédiée à un voyage, un logement ou un achat.', icon: Compass, tone: 'bg-blue-50 text-blue-600' },
  { title: 'Groupes de confiance', description: 'Retrouvez bientôt les tontines publiques recommandées par Ndjoka.', icon: ShieldCheck, tone: 'bg-violet-50 text-violet-600' },
]

export default function ExplorerPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-8">
      <header className="rounded-3xl bg-[linear-gradient(120deg,#166534,#1da35a)] p-6 text-white shadow-lg shadow-emerald-900/10 sm:p-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-100 uppercase">Découvrir autrement</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Trouvez la bonne dynamique d’épargne.</h2>
          <p className="mt-3 text-sm leading-6 text-emerald-50/90">
            Explorez les formats de tontines qui correspondent à votre rythme, puis créez votre propre groupe en quelques minutes.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={() => navigate('/tontines')}>
              Créer une tontine
            </Button>
            <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => navigate('/ndjoka-ai')}>
              <Sparkles /> Demander à Ndjoka AI
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 bg-card pl-10" placeholder="Rechercher une tontine ou un objectif" />
        </div>
        <Button variant="outline" className="h-11"><Filter /> Filtrer</Button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {ideas.map(({ title, description, icon: Icon, tone }) => (
          <Card key={title} className="transition-transform hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-5 w-5" /></span>
              <div><CardTitle className="text-base">{title}</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
            </CardHeader>
            <CardContent><Button variant="link" className="h-auto p-0 text-xs text-primary">En savoir plus →</Button></CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">Le catalogue communautaire arrive</p><p className="mt-1 text-sm text-muted-foreground">En attendant, rejoignez une tontine grâce à son invitation ou demandez une recommandation personnalisée.</p></div>
          <Button variant="outline" onClick={() => navigate('/tontines')}>Voir mes tontines</Button>
        </CardContent>
      </Card>
    </div>
  )
}
