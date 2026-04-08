import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0F] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Decorative circle — empty chart wheel */}
        <div className="mx-auto w-24 h-24 rounded-full border border-white/10 flex items-center justify-center relative">
          <span className="font-[family-name:var(--font-geist-mono)] text-3xl text-white/20">
            404
          </span>
          <div className="absolute inset-0 rounded-full border border-[#C8A84B]/10" />
        </div>

        <h1 className="text-xl font-semibold text-white/90 font-[family-name:var(--font-geist-sans)]">
          Page not found
        </h1>

        <p className="text-sm text-white/50 leading-relaxed">
          This celestial body has drifted beyond our chart. The page you&apos;re looking for
          doesn&apos;t exist or has been moved.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-[#0A0A0F] bg-[#C8A84B] rounded-lg hover:bg-[#D4B85C] transition-colors focus:outline-none focus:ring-2 focus:ring-[#C8A84B]/50"
          >
            Back to home
          </Link>
          <Link
            href="/chart"
            className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white/70 border border-white/10 rounded-lg hover:border-white/20 hover:text-white/90 transition-colors"
          >
            Calculate chart
          </Link>
        </div>
      </div>
    </div>
  );
}
