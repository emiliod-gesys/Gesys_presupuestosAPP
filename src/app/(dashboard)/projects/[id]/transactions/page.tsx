import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { formatCurrency, formatDate } from "@/lib/utils"
import { AddTransactionButton } from "@/components/projects/add-transaction-button"
import { DeleteTransactionButton } from "@/components/projects/delete-transaction-button"
import { TransactionFilters, TRANSACTION_PAGE_SIZE } from "@/components/projects/transaction-filters"
import { TransactionCommentsPanel } from "@/components/projects/transaction-comments-panel"
import { leafCategories } from "@/lib/budget-category-tree"
import type { UserRole } from "@/lib/types"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

type Search = Record<string, string | string[] | undefined>

function first(sp: Search, key: string): string {
  const v = sp[key]
  if (Array.isArray(v)) return v[0] ?? ""
  return v ?? ""
}

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Search>
}) {
  const { id } = await params
  const sp = await searchParams
  const q = first(sp, "q").trim()
  const from = first(sp, "from")
  const to = first(sp, "to")
  const category = first(sp, "category")
  const page = Math.max(1, parseInt(first(sp, "page") || "1", 10) || 1)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: membership }, { data: categories }, { data: txTypes }, { data: projectRow }] = await Promise.all([
    supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
    supabase.from("budget_categories").select("id, name, parent_id").eq("project_id", id).order("order_index"),
    supabase.from("transaction_types").select("*"),
    supabase.from("projects").select("currency").eq("id", id).single(),
  ])

  if (!membership) redirect("/dashboard")

  const currency = projectRow?.currency || "GTQ"

  const catsRaw = categories || []
  const catById = new Map(catsRaw.map((c) => [c.id, c]))
  const leafCats = leafCategories(catsRaw as { id: string; parent_id?: string | null }[])
  const categoryOptions = leafCats.map((c) => {
    const row = c as { id: string; name: string; parent_id?: string | null }
    const parent = row.parent_id ? (catById.get(row.parent_id) as { name?: string } | undefined) : undefined
    const label = parent?.name ? `${parent.name} — ${row.name}` : row.name
    return { value: row.id, label }
  })

  const expenseTypeIds = (txTypes || []).filter((t) => t.type === "expense").map((t) => t.id)

  let countQuery = supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("project_id", id)

  if (from) countQuery = countQuery.gte("date", from)
  if (to) countQuery = countQuery.lte("date", to)
  if (category) countQuery = countQuery.eq("category_id", category)
  if (q) countQuery = countQuery.ilike("description", `%${q}%`)
  if (expenseTypeIds.length > 0) countQuery = countQuery.in("transaction_type_id", expenseTypeIds)

  const { count } = await countQuery
  const totalCount = count ?? 0

  const fromIdx = (page - 1) * TRANSACTION_PAGE_SIZE
  const toIdx = fromIdx + TRANSACTION_PAGE_SIZE - 1

  let listQuery = supabase
    .from("transactions")
    .select("*, transaction_type:transaction_types(*), category:budget_categories(name), creator:profiles!created_by(full_name, email, avatar_url)")
    .eq("project_id", id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

  if (from) listQuery = listQuery.gte("date", from)
  if (to) listQuery = listQuery.lte("date", to)
  if (category) listQuery = listQuery.eq("category_id", category)
  if (q) listQuery = listQuery.ilike("description", `%${q}%`)
  if (expenseTypeIds.length > 0) listQuery = listQuery.in("transaction_type_id", expenseTypeIds)

  const { data: transactions } = await listQuery.range(fromIdx, toIdx)

  let totalsQuery = supabase
    .from("transactions")
    .select("amount, transaction_type:transaction_types(type)")
    .eq("project_id", id)
  if (expenseTypeIds.length > 0) totalsQuery = totalsQuery.in("transaction_type_id", expenseTypeIds)
  const { data: allForTotals } = await totalsQuery

  const role = membership.role as UserRole
  const canEdit = role === "admin" || role === "worker"
  const isAdmin = role === "admin"

  const totalExpense = (allForTotals || []).reduce((s, t) => s + Number(t.amount) || 0, 0)
  const txCount = (allForTotals || []).length

  const txIds = (transactions || []).map((t) => t.id)
  const commentCountByTx: Record<string, number> = {}
  if (txIds.length > 0) {
    const { data: ccRows, error: ccErr } = await supabase
      .from("transaction_comments")
      .select("transaction_id")
      .in("transaction_id", txIds)
    if (!ccErr && ccRows) {
      for (const r of ccRows) {
        const tid = (r as { transaction_id: string }).transaction_id
        commentCountByTx[tid] = (commentCountByTx[tid] || 0) + 1
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="mb-1 text-xs text-gray-500">Total gastos (proyecto)</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalExpense, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="mb-1 text-xs text-gray-500">Movimientos registrados</p>
            <p className="text-xl font-bold text-gray-900">{txCount}</p>
            <p className="mt-1 text-xs text-gray-400">Solo gastos; el presupuesto compara contra este total.</p>
          </CardContent>
        </Card>
      </div>

      <TransactionFilters
        projectId={id}
        categoryOptions={categoryOptions}
        initial={{ q, from, to, category }}
        page={page}
        totalCount={totalCount}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Transacciones · {totalCount} en total
            </h2>
            {canEdit && (
              <AddTransactionButton
                className="shrink-0"
                projectId={id}
                categories={categoryOptions}
                txTypes={(txTypes || [])
                  .filter((t) => t.type === "expense")
                  .map((t) => ({ value: t.id, label: t.name, type: t.type }))}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!transactions?.length ? (
            <div className="py-16 text-center text-gray-400">
              <p className="font-medium">Sin transacciones con estos criterios</p>
              {canEdit && totalCount === 0 && (
                <p className="mt-1 text-sm">Registra la primera transacción del proyecto</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {transactions.map((tx) => {
                const txType = tx.transaction_type as { type: string; name: string } | null
                const creator = tx.creator as { full_name?: string; email: string; avatar_url?: string } | null
                const vendor = (tx as { vendor?: string | null }).vendor
                const attachmentUrl = (tx as { attachment_url?: string | null }).attachment_url
                const cc = commentCountByTx[tx.id] || 0
                return (
                  <div
                    key={tx.id}
                    className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-gray-50 sm:flex-row sm:items-start sm:gap-4 sm:px-6"
                  >
                    <div className="flex items-start gap-3 sm:contents">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500 sm:mt-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                          <Badge variant="danger">{txType?.name}</Badge>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span>{formatDate(tx.date)}</span>
                          {(tx.category as { name?: string } | null)?.name && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5">
                              {(tx.category as { name: string }).name}
                            </span>
                          )}
                          {tx.reference_number && <span>Ref: {tx.reference_number}</span>}
                          {vendor && <span>Prov.: {vendor}</span>}
                          {attachmentUrl && (
                            <Link
                              href={attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline"
                            >
                              Adjunto <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                        <TransactionCommentsPanel
                          transactionId={tx.id}
                          canAdd={canEdit}
                          currentUserId={user.id}
                          isAdmin={isAdmin}
                          initialCount={cc}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2 sm:flex-1 sm:justify-end sm:border-t-0 sm:pt-0">
                      <p className="text-sm font-bold text-red-700 sm:text-right">
                        −{formatCurrency(tx.amount, currency)}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <Avatar src={creator?.avatar_url} name={creator?.full_name || creator?.email} size="xs" />
                        {(role === "admin" || tx.created_by === user.id) && (
                          <DeleteTransactionButton transactionId={tx.id} />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
