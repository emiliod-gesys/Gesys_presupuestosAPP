/** Utilidades para jerarquía parent_id en budget_categories. */

export type CategoryLike = {
  id: string
  parent_id?: string | null
  order_index?: number
}

export function sortByOrderIndex<T extends { order_index?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))
}

/** Ids que tienen al menos una categoría hija. */
export function idsWithChildren(categories: { id: string; parent_id?: string | null }[]): Set<string> {
  const s = new Set<string>()
  for (const c of categories) {
    if (c.parent_id) s.add(c.parent_id)
  }
  return s
}

export function isLeafCategory(categories: { id: string; parent_id?: string | null }[], id: string): boolean {
  return !idsWithChildren(categories).has(id)
}

export function leafCategories<T extends { id: string; parent_id?: string | null }>(categories: T[]): T[] {
  return categories.filter((c) => isLeafCategory(categories, c.id))
}

/** Raíz + hijas ordenadas; cada raíz es una sección (si no hay hijas, solo el renglón raíz). */
export function budgetCategorySections<T extends CategoryLike>(categories: T[]): { header: T; children: T[] }[] {
  const sorted = sortByOrderIndex(categories)
  const roots = sorted.filter((c) => !c.parent_id)
  const childrenOf = (pid: string) => sorted.filter((c) => c.parent_id === pid)
  return roots.map((header) => ({ header, children: childrenOf(header.id) }))
}

/** Borrador de renglón en formulario "Nuevo proyecto". */
export interface NewProjectLineDraft {
  id: string
  name: string
  description: string
  budget_amount: string
}

/** Borrador de categoría (padre) con renglones hijos. */
export interface NewProjectGroupDraft {
  id: string
  name: string
  description: string
  lines: NewProjectLineDraft[]
}

let _draftSeq = 0
function nextDraftId(prefix: string) {
  _draftSeq += 1
  return `${prefix}-${Date.now()}-${_draftSeq}`
}

export function emptyLineDraft(): NewProjectLineDraft {
  return { id: nextDraftId("l"), name: "", description: "", budget_amount: "" }
}

export function emptyGroupDraft(): NewProjectGroupDraft {
  return { id: nextDraftId("g"), name: "", description: "", lines: [emptyLineDraft()] }
}

type TemplateCat = {
  id: string
  name: string
  description: string | null
  budget_amount: number
  parent_id: string | null
  order_index: number
}

/** Convierte filas de plantilla/proyecto en grupos para el formulario. */
export function templateCategoriesToGroupDrafts(cats: TemplateCat[]): NewProjectGroupDraft[] {
  if (!cats?.length) return [emptyGroupDraft()]
  const sorted = sortByOrderIndex(cats)
  const roots = sorted.filter((c) => !c.parent_id)
  const childrenOf = (pid: string) => sorted.filter((c) => c.parent_id === pid)

  const groups: NewProjectGroupDraft[] = []
  for (const root of roots) {
    const children = childrenOf(root.id)
    if (children.length > 0) {
      groups.push({
        id: `tpl-g-${root.id}`,
        name: root.name,
        description: root.description || "",
        lines: children.map((line) => ({
          id: `tpl-l-${line.id}`,
          name: line.name,
          description: line.description || "",
          budget_amount: String(line.budget_amount),
        })),
      })
    } else {
      groups.push({
        id: `tpl-g-${root.id}`,
        name: "",
        description: "",
        lines: [
          {
            id: `tpl-l-${root.id}`,
            name: root.name,
            description: root.description || "",
            budget_amount: String(root.budget_amount),
          },
        ],
      })
    }
  }
  return groups.length ? groups : [emptyGroupDraft()]
}
