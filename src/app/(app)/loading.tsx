export default function AppLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        {/* Rotating chart wheel loader */}
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          className="animate-spin"
          style={{ animationDuration: '3s' }}
        >
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="rgba(200,168,75,0.2)"
            strokeWidth="2"
          />
          <path
            d="M24 4 a20 20 0 0 1 20 20"
            fill="none"
            stroke="#C8A84B"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-xs text-white/30 font-[family-name:var(--font-geist-mono)] tracking-wider uppercase">
          Calculating&hellip;
        </span>
      </div>
    </div>
  );
}
