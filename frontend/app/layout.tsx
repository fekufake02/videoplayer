import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { UploadProvider } from '../context/UploadContext';
import { PrivacyOverlay } from '../components/PrivacyOverlay';
import { UploadDock } from '../components/UploadDock';
import { UploadModal } from '../components/UploadModal';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'My Vault',
  description: 'Your elegant media vault with seamless playback control.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${outfit.variable}`}>
      <body className="bg-black text-zinc-100 min-h-screen flex flex-col font-sans selection:bg-indigo-600 selection:text-white antialiased">
        <AuthProvider>
          <UploadProvider>
            <PrivacyOverlay />
            {children}
            <UploadDock />
            <UploadModal />
          </UploadProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
