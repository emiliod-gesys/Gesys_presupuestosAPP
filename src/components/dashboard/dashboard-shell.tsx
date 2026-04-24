"use client"

import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"
import { Sidebar } from "@/components/dashboard/sidebar"
import type { Profile } from "@/lib/types"

interface DashboardShellProps {
  profile: Profile
  unreadCount: number
  children: React.ReactNode
}

export function DashboardShell({ profile, unreadCount, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  return (
    <div className="min-h-screen flex bg-gray-50">
      <header className="md:hidden fixed top-0 left-0 right-0 z-[60] flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-3 shadow-sm">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-label="Abrir menú de navegación"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 active:bg-gray-200"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 shadow-sm">
            <span className="text-xs font-bold text-white">G</span>
          </div>
          <span className="truncate text-sm font-semibold text-gray-900">Gesys Presupuestos</span>
        </div>
      </header>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        profile={profile}
        unreadCount={unreadCount}
        onNavClick={() => setMobileOpen(false)}
        className={
          mobileOpen
            ? "translate-x-0 shadow-xl"
            : "-translate-x-full md:translate-x-0 md:shadow-none"
        }
        headerAddon={
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        }
      />

      <main className="min-h-screen w-full min-w-0 flex-1 px-4 pb-8 pt-[4.5rem] md:ml-64 md:p-8 md:pt-8">
        {children}
      </main>
    </div>
  )
}
