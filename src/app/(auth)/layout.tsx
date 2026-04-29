export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <img
              src="/branding/presucore-isotype.png"
              alt="PresuCore"
              width={96}
              height={96}
              className="h-[4.5rem] w-[4.5rem] object-contain sm:h-20 sm:w-20"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">PresuCore</h1>
          <p className="text-gray-500 text-sm mt-1">Aplicación de gestión de presupuestos por Gesys</p>
        </div>
        {children}
      </div>
    </div>
  )
}
