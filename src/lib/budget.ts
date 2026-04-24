/** Suma de montos asignados en renglones (presupuesto por categoría). */
export function sumCategoryBudgets(
  categories: { budget_amount: number | string }[] | null | undefined
): number {
  if (!categories?.length) return 0
  return categories.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0)
}

/** Diferencia entre total declarado del proyecto y suma de renglones (0 = alineado). */
export function projectBudgetDelta(
  projectTotalBudget: number | string,
  categories: { budget_amount: number | string }[] | null | undefined
): number {
  const total = Number(projectTotalBudget) || 0
  const sumLines = sumCategoryBudgets(categories)
  return Math.round((total - sumLines) * 100) / 100
}

export function isBudgetAligned(
  projectTotalBudget: number | string,
  categories: { budget_amount: number | string }[] | null | undefined,
  tolerance = 0.01
): boolean {
  return Math.abs(projectBudgetDelta(projectTotalBudget, categories)) <= tolerance
}
