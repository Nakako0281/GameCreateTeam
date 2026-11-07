export default function SampleGame03() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-violet-50 to-fuchsia-100 p-6 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-4xl shadow-md">
        🚀
      </div>
      <h2 className="text-xl font-extrabold text-slate-800">
        サンプルゲーム 03
      </h2>
      <p className="mt-2 text-sm font-medium text-slate-500">
        ここにゲーム画面（Canvas / Three.js / React UI）が入ります
      </p>
      <div className="mt-6 rounded-2xl border-2 border-dashed border-violet-300 bg-white/70 px-4 py-3 text-xs font-mono text-violet-800">
        src/games/sample-03/index.tsx
      </div>
    </div>
  )
}
