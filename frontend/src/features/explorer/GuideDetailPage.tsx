import { ArrowLeft, BookOpen, ChevronRight, Clock } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GUIDES, getGuide } from '@/features/explorer/guides-content'

export default function GuideDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const guide = getGuide(slug ?? '')

  if (!guide) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-10 text-center">
        <p className="font-semibold text-foreground">Article introuvable.</p>
        <Button variant="outline" onClick={() => navigate('/explorer')}>
          Retour à l’exploration
        </Button>
      </div>
    )
  }

  const others = GUIDES.filter((item) => item.id !== guide.id).slice(0, 2)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        type="button"
        onClick={() => navigate('/explorer')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Conseils Tontine
      </button>

      <header className="rounded-3xl bg-[linear-gradient(120deg,#166534,#1da35a)] p-6 text-white shadow-lg shadow-emerald-900/10 sm:p-8">
        <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold ${guide.categoryColor}`}>
          {guide.category}
        </span>
        <h1 className="mt-3 text-xl font-bold sm:text-2xl">{guide.title}</h1>
        <div className="mt-2 flex items-center gap-2 text-xs text-emerald-100">
          <Clock className="h-3 w-3" /> {guide.readMinutes} min de lecture
        </div>
      </header>

      <Card>
        <CardContent className="space-y-5 p-6 sm:p-8">
          <p className="border-b pb-6 text-base leading-relaxed font-medium text-muted-foreground">
            {guide.excerpt}
          </p>
          {guide.content.map((block, index) => (
            <div key={index}>
              {block.heading ? (
                <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-foreground">
                  <span className="inline-block h-5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {block.heading}
                </h2>
              ) : null}
              <p className="text-sm leading-relaxed text-muted-foreground">{block.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {others.length > 0 ? (
        <div>
          <h3 className="mb-4 flex items-center gap-2 font-bold text-foreground">
            <BookOpen className="h-4 w-4 text-muted-foreground" /> Autres conseils
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {others.map((item) => (
              <Link
                key={item.id}
                to={`/explorer/guides/${item.slug}`}
                className="group flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
              >
                <span className={`w-fit rounded-full border px-2 py-0.5 text-xs font-bold ${item.categoryColor}`}>
                  {item.category}
                </span>
                <p className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-emerald-700">
                  {item.title}
                </p>
                <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  Lire <ChevronRight className="h-3 w-3" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
