export default function ProgressBar({ active }) {
  if (!active) return null;
  return (
    <div className="w-full h-1.5 bg-slate-200 rounded overflow-hidden">
      <div className="h-full w-1/3 bg-blue-500 animate-[progress_1.4s_ease-in-out_infinite]" />
      <style>{`
        @keyframes progress {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
