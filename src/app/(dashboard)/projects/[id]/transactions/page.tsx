import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { formatCurrency, formatDate } from "@/lib/utils"
import { AddTransactionButton } from "@/components/projects/add-transaction-button"
import { DeleteTransactionButton } from "@/components/projects/delete-transaction-button"
import type { UserRole } from "@/lib/types"

export default async function TransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: membership }, { data: transactions }, { data: categories }, { data: txTypes }] = await Promise.all([
    supabase.from("project_members").select("role").eq("project_id", id).eq("user_id", user.id).single(),
    supabase
      .from("transactions")
      .select("*, transaction_type:transaction_types(*), category:budget_categories(name), creator:profiles!created_by(full_name, email, avatar_url)")
      .eq("project_id", id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("budget_categories").select("id, name").eq("project_id", id).order("order_index"),
    supabase.from("transaction_types").select("*"),
  ])

  if (!membership) redirect("/dashboard")

  const role = membership.role as UserRole
  const canEdit = role === "admin" || role === "worker"

  const totalIncome = (transactions || []).reduce((s, t) =>
    (t.transaction_type as { type: string })?.type === "income" ? s + t.amount : s, 0)
  const totalExpense = (transactions || []).reduce((s, t) =>
    (t.transaction_type as { type: string })?.type === "expense" ? s + t.amount : s, 0)

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 mb-1">Total ingresos</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 mb-1">Total gastos</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalExpense)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 mb-1">Balance</p>
            <p className={`text-xl font-bold ${totalIncome - totalExpense >= 0 ? "text-indigo-700" : "text-red-600"}`}>
              {formatCurrency(totalIncome - totalExpense)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Transacciones ({transactions?.length || 0})
            </h2>
            {canEdit && (
              <AddTransactionButton
                projectId={id}
                categories={(categories || []).map((c) => ({ value: c.id, label: c.name }))}
                txTypes={(txTypes || []).map((t) => ({ value: t.id, label: t.name, type: t.type }))}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!transactions?.length ? (
            <div className="py-16 text-center text-gray-400">
              <p className="font-medium">Sin transacciones registradas</p>
              {canEdit && <p className="text-sm mt-1">Registra la primera transacción del proyecto</p>}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {transactions.map((tx) => {
                const txType = tx.transaction_type as { type: string; name: string } | null
                const creator = tx.creator as { full_name?: string; email: string; avatar_url?: string } | null
                return (
                  <div key={tx.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${txType?.type === "income" ? "bg-green-500" : "bg-red-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{tx.description}</p>
                        <Badge variant={txType?.type === "income" ? "success" : "danger"}>
                          {txType?.name}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span>{formatDate(tx.date)}</span>
                        {(tx.category as { name?: string } | null)?.name && (
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded">
                            {(tx.category as { name: string }).name}
                          </span>
                        )}
                        {tx.reference_number && <span>Ref: {tx.reference_number}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-bold text-sm ${txType?.type === "income" ? "text-green-700" : "text-red-700"}`}>
                        {txType?.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Avatar src={creator?.avatar_url} name={creator?.full_name || creator?.email} size="xs" />
                      {(role === "admin" || tx.created_by === user.id) && (
                        <DeleteTransactionButton transactionId={tx.id} />
                      )}
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
