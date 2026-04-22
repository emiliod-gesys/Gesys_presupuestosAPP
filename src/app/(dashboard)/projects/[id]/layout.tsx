import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ProjectNav } from "@/components/projects/project-nav"

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
    <div className="max-w-7xl mx-auto space-y-6 animate-in">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-indigo-600">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{project.name}</span>
      </div>
      <ProjectNav projectId={id} role={membership.role} projectName={project.name} />
      {children}
    </div>
  )
}
