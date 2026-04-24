/** Layout mínimo para documentos imprimibles (sin sidebar del dashboard). */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-gray-900 print:bg-white">{children}</div>
}
