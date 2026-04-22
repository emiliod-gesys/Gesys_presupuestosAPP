import { cn, getInitials } from "@/lib/utils"

interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}

const sizes = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
}

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || "Avatar"}
        className={cn("rounded-full object-cover flex-shrink-0", sizes[size], className)}
      />
    )
  }
  return (
    <div className={cn("rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold flex-shrink-0", sizes[size], className)}>
      {name ? getInitials(name) : "?"}
    </div>
  )
}
