/** Normaliza NIT guatemalteco (solo dígitos). */
export function normalizeGtNit(input: string): string {
  return input.replace(/[^\d]/g, "")
}

/** Validación superficial para almacenamiento (no valida dígito verificador SAT). */
export function isValidGtNitFormat(normalized: string): boolean {
  return /^[0-9]{4,15}$/.test(normalized)
}
