import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Rendu minimal et sûr des documents Markdown internes (CGU, confidentialité,
 * à propos, équipe). Prend en charge titres, paragraphes, listes, tableaux,
 * gras, italique, code et liens. Aucun HTML brut n'est interprété.
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source)
  return <div className={className ?? 'space-y-4'}>{blocks.map((block, index) => renderBlock(block, index))}</div>
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'rule' }

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0
  while (index < lines.length) {
    const raw = lines[index]
    const line = raw.trim()
    if (!line) { index += 1; continue }
    if (/^-{3,}$/.test(line)) { blocks.push({ type: 'rule' }); index += 1; continue }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); index += 1; continue }
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('|')) { tableLines.push(lines[index].trim()); index += 1 }
      const cells = (row: string) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
      const header = cells(tableLines[0])
      const rows = tableLines.slice(1).filter((row) => !/^\|?\s*:?-{2,}/.test(row)).map(cells)
      blocks.push({ type: 'table', header, rows })
      continue
    }
    if (/^([*-])\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*([*-])\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[*-]\s+/, '').trim())
        index += 1
      }
      blocks.push({ type: 'list', items })
      continue
    }
    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index].trim()
      if (!next || /^(#{1,6})\s/.test(next) || next.startsWith('|') || /^([*-])\s+/.test(next) || /^-{3,}$/.test(next)) break
      paragraph.push(next)
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }
  return blocks
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const text = renderInline(block.text)
      if (block.level === 1) return <h1 key={key} className="text-2xl font-bold tracking-tight text-slate-900">{text}</h1>
      if (block.level === 2) return <h2 key={key} className="mt-8 flex items-center gap-2 text-lg font-bold text-slate-800"><span className="inline-block h-5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{text}</h2>
      return <h3 key={key} className="mt-5 text-base font-bold text-slate-800">{text}</h3>
    }
    case 'paragraph':
      return <p key={key} className="text-sm leading-relaxed text-slate-600">{renderInline(block.text)}</p>
    case 'list':
      return (
        <ul key={key} className="space-y-2">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
    case 'table':
      return (
        <div key={key} className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold tracking-wider text-slate-500 uppercase">
              <tr>{block.header.map((cell, cellIndex) => <th key={cellIndex} className="px-4 py-2.5">{renderInline(cell)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-2.5 text-slate-600">{renderInline(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'rule':
      return <hr key={key} className="border-slate-100" />
  }
}

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g

function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE_PATTERN).filter((part) => part !== '')
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{part.slice(1, -1)}</code>
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link) {
      const [, label, href] = link
      if (href.startsWith('/')) return <Link key={index} to={href} className="font-medium text-emerald-700 underline-offset-2 hover:underline">{label}</Link>
      return <a key={index} href={href} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline-offset-2 hover:underline">{label}</a>
    }
    return <Fragment key={index}>{part}</Fragment>
  })
}
