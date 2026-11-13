import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Card, EmptyState, ErrorState, PageLoader } from './ui'

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
      <span>Page {page} of {pages} · {total} total</span>
      <div className="flex gap-1">
        <button className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * columns: [{ key, header, render?(row), className? }]
 */
export default function DataTable({ columns, rows, loading, error, onRetry, toolbar, empty, pagination, onRowClick, rowKey = 'id' }) {
  return (
    <Card className="overflow-hidden">
      {toolbar && <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">{toolbar}</div>}
      {loading && !rows?.length ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !rows?.length ? (
        empty || <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/70">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${c.className || ''}`}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-slate-100 ${loading ? 'opacity-60' : ''}`}>
              {rows.map((row) => (
                <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}>
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 align-middle text-slate-700 ${c.className || ''}`}>
                      {c.render ? c.render(row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination && <Pagination {...pagination} />}
    </Card>
  )
}
