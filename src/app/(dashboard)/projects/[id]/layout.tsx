import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ProjectNav } from "@/components/projects/project-nav"
import { ProjectArchiveBanner } from "@/components/projects/project-archive-banner"

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, status, created_by")
    .eq("id", id)
    .single()

  if (!project) notFound()

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", id)
    .eq("user_id", user.id)
    .single()

  if (!membership) redirect("/dashboard")

  return (
    <div className="mx-auto max-w-7xl space-y-4 animate-in sm:space-y-6">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 sm:text-sm">
        <Link href="/dashboard" className="shrink-0 hover:text-indigo-600">
          Dashboard
        </Link>
        <span className="shrink-0">/</span>
        <span className="min-w-0 font-medium text-gray-900">{project.name}</span>
      </div>
      <ProjectArchiveBanner show={project.status === "archived"} />
      <ProjectNav projectId={id} role={membership.role} projectName={project.name} />
      {children}
    </div>
  )
}
