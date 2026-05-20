import type { Page } from "puppeteer-core"
import { captureConsultaDteViaPortalUiEnhanced } from "./fel-portal-sniff"

/** Dispara la consulta en la SPA felcons y captura la respuesta JSON de consulta-dte. */
export async function captureConsultaDteViaPortalUi(
  page: Page,
  operationType: "E" | "R",
  dateFromIso: string,
  dateToIso: string,
  onCheckpoint?: (stage: string, detail?: string) => void
): Promise<unknown | null> {
  const cap = await captureConsultaDteViaPortalUiEnhanced(
    page,
    operationType,
    dateFromIso,
    dateToIso,
    onCheckpoint
  )
  return cap.json
}

export {
  captureConsultaDteViaPortalUiEnhanced,
  attachFelconsConsultaSniffer,
  readFelconsStorageHints,
  readFelconsSessionUsuario,
} from "./fel-portal-sniff"
export type { FelPortalSniffHit, FelPortalUiCapture } from "./fel-portal-sniff"
