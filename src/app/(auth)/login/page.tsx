"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const profileReason = searchParams.get("reason") === "profile"
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast("error", error.message === "Invalid login credentials"
        ? "Correo o contraseña incorrectos"
        : error.message)
      setLoading(false)
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      toast("error", "Error al iniciar sesión con Google")
      setGoogleLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Iniciar sesión</h2>

        {profileReason && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No se pudo preparar tu perfil en la aplicación (falta de fila en la base de datos o permisos).
            Vuelve a intentar; si el problema continúa, contacta al administrador para revisar la tabla{" "}
            <code className="rounded bg-amber-100/80 px-1 text-xs">profiles</code> y la política{" "}
            <code className="rounded bg-amber-100/80 px-1 text-xs">profiles_insert_own</code>.
          </p>
        )}

        <Button
          variant="outline"
          className="w-full mb-4"
          onClick={handleGoogle}
          loading={googleLoading}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </Button>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-gray-500">o con correo electrónico</span>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Correo electrónico"
            type="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" loading={loading}>
            Iniciar sesión
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿No tienes cuenta?{" "}
          <Link href="/signup" className="text-indigo-600 font-medium hover:underline">
            Crear cuenta gratis
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="flex min-h-[280px] items-center justify-center pt-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </CardContent>
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
