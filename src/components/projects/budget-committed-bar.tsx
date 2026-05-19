import { budgetCommittedStackWidths, cn } from "@/lib/utils"

type Props = {
  spent: number
  pending: number
  budget: number
  /** Altura Tailwind, ej. h-2, h-3, h-4 */
  heightClass?: string
  trackClassName?: string
  className?: string
}

/** Barra apilada: ejecutado (verde) + compromiso pendiente (morado). */
export function BudgetCommittedBar({
  spent,
  pending,
  budget,
  heightClass = "h-2.5",
  trackClassName = "bg-gray-100",
  className,
}: Props) {
  const { spentWidth, pendingWidth } = budgetCommittedStackWidths(spent, pending, budget)
  const empty = spentWidth <= 0 && pendingWidth <= 0

  if (empty) {
    return <div className={cn("w-full rounded-full", heightClass, trackClassName, className)} />
  }

  return (
    <div
      className={cn("flex w-full overflow-hidden rounded-full", heightClass, trackClassName, className)}
      role="img"
      aria-label="Compromiso de presupuesto: tramo verde ejecutado, tramo morado compromiso pendiente"
    >
      {spentWidth > 0 ? (
        <div
          className="h-full shrink-0 bg-emerald-500 transition-[width] duration-300"
          style={{ width: `${spentWidth}%` }}
        />
      ) : null}
      {pendingWidth > 0 ? (
        <div
          className="h-full shrink-0 bg-violet-600 transition-[width] duration-300"
          style={{ width: `${pendingWidth}%` }}
        />
      ) : null}
    </div>
  )
}
