"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

export const TRANSACTION_PAGE_SIZE = 20

interface Option {
  value: string
  label: string
}

export function TransactionFilters({
  projectId,
  categoryOptions,
  initial,
  page,
  totalCount,
}: {
  projectId: string
  categoryOptions: Option[]
  initial: {
    q: string
    from: string
    to: string
    category: string
  }
  page: number
  totalCount: number
}) {
  const router = useRouter()
  const [q, setQ] = useState(initial.q)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [category, setCategory] = useState(initial.category)

  const totalPages = Math.max(1, Math.ceil(totalCount / TRANSACTION_PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages

  const buildUrl = (nextPage: number) => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (category) p.set("category", category)
    if (nextPage > 1) p.set("page", String(nextPage))
    const qs = p.toString()
    return qs ? `/projects/${projectId}/transactions?${qs}` : `/projects/${projectId}/transactions`
  }

  const apply = () => {
    router.push(buildUrl(1))
  }

  const clear = () => {
    setQ("")
    setFrom("")
    setTo("")
    setCategory("")
    router.push(`/projects/${projectId}/transactions`)
  }

  const exportCsvHref = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (category) p.set("category", category)
    const qs = p.toString()
    return `/api/projects/${projectId}/export/transactions${qs ? `?${qs}` : ""}`
  }, [projectId, q, from, to, category])

  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Buscar en descripción" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Texto..." />
        <Input label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Renglón"
          options={[{ value: "", label: "Todos" }, ...categoryOptions]}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <div className="flex flex-col justify-end gap-2 sm:flex-row sm:items-end">
          <Button type="button" className="w-full sm:flex-1" onClick={apply}>
            Aplicar filtros
          </Button>
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={clear}>
            Limpiar
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-gray-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          {totalCount} transacción{totalCount === 1 ? "" : "es"} · Página {page} de {totalPages}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={exportCsvHref}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            CSV (filtros aplicados en URL)
          </a>
          <Button type="button" variant="outline" size="sm" disabled={!hasPrev} onClick={() => router.push(buildUrl(page - 1))}>
            Anterior
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => router.push(buildUrl(page + 1))}>
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
