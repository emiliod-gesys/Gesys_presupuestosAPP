"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { RoleBadge } from "@/components/ui/badge"
import type { UserRole } from "@/lib/types"

interface ProjectNavProps {
  projectId: string
  role: UserRole
  projectName: string
}

export function ProjectNav({ projectId, role, projectName }: ProjectNavProps) {
  const pathname = usePathname()
  const base = `/projects/${projectId}`

  const tabs = [
    { href: base, label: "Resumen" },
    { href: `${base}/budget`, label: "Presupuesto" },
    { href: `${base}/transactions`, label: "Transacciones" },
    { href: `${base}/members`, label: "Miembros" },
    ...(role === "admin" ? [
      { href: `${base}/alerts`, label: "Alertas" },
      { href: `${base}/logs`, label: "Actividad" },
    ] : []),
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <h1 className="min-w-0 text-lg font-bold text-gray-900 sm:text-xl">{projectName}</h1>
        <div className="flex-shrink-0 self-start">
          <RoleBadge role={role} />
        </div>
      </div>
      <nav
        className="-mx-1 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-gray-200 px-1 pb-px [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        aria-label="Secciones del proyecto"
      >
        {tabs.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors -mb-px sm:px-4 sm:text-sm",
                active
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
