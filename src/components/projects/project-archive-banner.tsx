"use client"

export function ProjectArchiveBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Proyecto <strong>archivado</strong>: solo consulta. Los administradores pueden{" "}
      <strong>reactivarlo</strong> (estado Activo) desde el resumen del proyecto.
    </div>
  )
}
