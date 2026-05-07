"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { FileText } from "lucide-react"

export type TransactionDetailPayload = {
  id: string
  description: string
  amount: number
  date: string
  reference_number: string | null
  vendor: string | null
  notes: string | null
  attachment_url: string | null
  created_at: string
  updated_at: string
  typeName: string
  typeFlow: string
  categoryName: string | null
  creatorName: string | null
  creatorEmail: string
}

function safeExternalHref(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim()
  if (/^https?:\/\//i.test(t)) return t
  if (t.startsWith("//")) return `https:${t}`
  if (t.startsWith("/")) return null
  return `https://${t.replace(/^\/+/, "")}`
}

export function TransactionDetailButton({
  currency,
  detail,
}: {
  currency: string
  detail: TransactionDetailPayload
}) {
  const [open, setOpen] = useState(false)

  const attachHref = safeExternalHref(detail.attachment_url)

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => setOpen(true)}>
        <FileText className="h-3.5 w-3.5" />
        Ver detalles
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Detalle de la transacción" size="lg">
        <div className="max-h-[75dvh] space-y-4 overflow-y-auto p-6">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">Descripción</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{detail.description}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Monto</dt>
              <dd className="mt-0.5 text-lg font-bold text-red-700">−{formatCurrency(detail.amount, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Fecha del movimiento</dt>
              <dd className="mt-0.5 text-gray-900">{formatDate(detail.date)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Tipo</dt>
              <dd className="mt-0.5 text-gray-900">
                {detail.typeName}{" "}
                <span className="text-gray-500">({detail.typeFlow === "expense" ? "Gasto" : "Ingreso"})</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Renglón / categoría</dt>
              <dd className="mt-0.5 text-gray-900">{detail.categoryName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Referencia</dt>
              <dd className="mt-0.5 text-gray-900">{detail.reference_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Proveedor / contratista</dt>
              <dd className="mt-0.5 text-gray-900">{detail.vendor ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">Notas</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-gray-900">{detail.notes?.trim() ? detail.notes : "—"}</dd>
            </div>
            {detail.attachment_url?.trim() && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-gray-500">Enlace adjunto (legacy)</dt>
                <dd className="mt-0.5 break-all">
                  {attachHref ? (
                    <a href={attachHref} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                      {detail.attachment_url}
                    </a>
                  ) : (
                    <span className="text-gray-700">{detail.attachment_url}</span>
                  )}
                </dd>
              </div>
            )}
            <div className="sm:col-span-2 border-t border-gray-100 pt-3">
              <dt className="text-xs font-medium text-gray-500">Registrado por</dt>
              <dd className="mt-0.5 text-gray-900">
                {detail.creatorName || "—"}{" "}
                <span className="text-gray-500">({detail.creatorEmail})</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Creado</dt>
              <dd className="mt-0.5 text-gray-700">
                {detail.created_at ? formatDateTime(detail.created_at) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Última actualización</dt>
              <dd className="mt-0.5 text-gray-700">
                {detail.updated_at ? formatDateTime(detail.updated_at) : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">ID interno</dt>
              <dd className="mt-0.5 font-mono text-xs text-gray-500">{detail.id}</dd>
            </div>
          </dl>
          <div className="flex justify-end border-t border-gray-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
