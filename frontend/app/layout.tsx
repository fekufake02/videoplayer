import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { PrivacyOverlay } from '../components/PrivacyOverlay';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'Metime — Private Video Vault',
  description: 'Your elegant private video space with seamless playback control.',
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
          <PrivacyOverlay />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
