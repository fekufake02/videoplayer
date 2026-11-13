import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#090A0F] text-[#F4F5F8] flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="bg-[#131620] max-w-md w-full p-8 rounded-2xl border border-white/[0.08] shadow-2xl flex flex-col items-center">
        <h1 className="text-6xl font-extrabold text-indigo-400 mb-2 tracking-tight">404</h1>
        <h2 className="text-xl font-semibold text-white mb-3">Page Not Found</h2>
        <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
          The requested media, collection, or destination could not be found or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-500/20"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library</span>
        </Link>
      </div>
    </div>
  );
}
