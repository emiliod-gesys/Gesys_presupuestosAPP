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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{projectName}</h1>
        <RoleBadge role={role} />
      </div>
      <nav className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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
