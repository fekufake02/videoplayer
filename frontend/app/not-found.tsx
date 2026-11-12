import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#090d16] text-white flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="glass-panel max-w-md w-full p-8 rounded-2xl border border-slate-800 shadow-2xl flex flex-col items-center">
        <h1 className="text-6xl font-extrabold text-amber-400 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-slate-200 mb-4">Page Not Found</h2>
        <p className="text-sm text-slate-400 mb-6">
          The requested media, collection, or destination could not be found or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-400/20"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library</span>
        </Link>
      </div>
    </div>
  );
}
