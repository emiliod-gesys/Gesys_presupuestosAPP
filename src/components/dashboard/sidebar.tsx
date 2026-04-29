"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Avatar } from "@/components/ui/avatar"
import {
  LayoutDashboard,
  Users,
  LogOut,
  ChevronRight,
} from "lucide-react"
import type { Profile } from "@/lib/types"

interface SidebarProps {
  profile: Profile
  unreadCount?: number
  /** Clases extra en el aside (p. ej. translate en móvil). */
  className?: string
  /** Tras navegar en móvil, cerrar drawer. */
  onNavClick?: () => void
  /** Botón cerrar u otro control en la cabecera (solo móvil). */
  headerAddon?: ReactNode
}

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companions", label: "Compañeros", icon: Users },
]

export function Sidebar({
  profile,
  unreadCount = 0,
  className,
  onNavClick,
  headerAddon,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    onNavClick?.()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-[56] flex w-[min(100vw-2rem,20rem)] max-w-none flex-col border-r border-gray-200 bg-white transition-transform duration-200 ease-out md:z-30 md:w-80",
        className
      )}
    >
      {/* Logo: PNG pensado para fondo claro; fallback SVG sin bloque negro */}
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-4 md:gap-3 md:px-6 md:py-5">
        <div className="flex h-9 flex-shrink-0 items-center rounded-lg bg-white px-1.5 ring-1 ring-gray-200">
          <img
            src="/branding/gesys-logo.png"
            alt="GESYS"
            width={256}
            height={72}
            className="h-7 w-auto max-w-[7.5rem] object-contain object-left md:max-w-[9rem]"
            decoding="async"
            onError={(e) => {
              const el = e.currentTarget
              if (!el.src.endsWith("gesys-logo.svg")) el.src = "/branding/gesys-logo.svg"
            }}
          />
        </div>
        <div className="min-w-0 flex-1 pr-1">
          <p className="text-sm font-semibold leading-snug text-gray-900 break-words">PresuCore</p>
        </div>
        {headerAddon}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={() => onNavClick?.()}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
              {label === "Dashboard" && unreadCount > 0 && (
                <span className="ml-auto bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-gray-100 p-3">
        <Link
          href="/profile"
          onClick={() => onNavClick?.()}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
            pathname === "/profile" ? "bg-gray-100" : "hover:bg-gray-50"
          )}
        >
          <Avatar src={profile.avatar_url} name={profile.full_name || profile.email} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {profile.full_name || "Sin nombre"}
            </p>
            <p className="text-xs text-gray-500 truncate">{profile.email}</p>
          </div>
          <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
        </Link>
        <button
          onClick={handleLogout}
          className="mt-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
