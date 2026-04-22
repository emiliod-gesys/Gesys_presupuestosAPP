import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  outline: "border border-gray-300 text-gray-600",
}

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", variants[variant], className)}
      {...props}
    >
      {children}
    </span>
  )
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    admin: { label: "Administrador", variant: "info" },
    worker: { label: "Trabajador", variant: "success" },
    observer: { label: "Observador", variant: "outline" },
  }
  const cfg = map[role] || { label: role, variant: "default" }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: "Activo", variant: "success" },
    completed: { label: "Completado", variant: "info" },
    archived: { label: "Archivado", variant: "default" },
    pending: { label: "Pendiente", variant: "warning" },
    accepted: { label: "Aceptado", variant: "success" },
    rejected: { label: "Rechazado", variant: "danger" },
  }
  const cfg = map[status] || { label: status, variant: "default" }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}
