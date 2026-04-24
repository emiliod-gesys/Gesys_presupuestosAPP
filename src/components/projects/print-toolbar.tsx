"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PrintToolbar({ title }: { title: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <p className="text-sm text-gray-500">{title}</p>
      <Button type="button" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Imprimir / Guardar como PDF
      </Button>
    </div>
  )
}
