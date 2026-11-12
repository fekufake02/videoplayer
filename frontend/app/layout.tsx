import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { UploadProvider } from '../context/UploadContext';
import { PipProvider } from '../context/PipContext';
import { PrivacyOverlay } from '../components/PrivacyOverlay';
import { DecoyInterfaceWrapper } from '../components/DecoyInterfaceWrapper';
import { UploadDock } from '../components/UploadDock';
import { UploadModal } from '../components/UploadModal';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'My Vault - Media & Video Player',
  description: 'An elegant, private video vault and streaming player with Backblaze B2 and Google Drive integration.',
  openGraph: {
    title: 'My Vault - Media & Video Player',
    description: 'An elegant, private video vault and streaming player with Backblaze B2 and Google Drive integration.',
  },
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
      <body className="bg-background text-text-primary min-h-screen flex flex-col font-sans selection:bg-accent/30 selection:text-white antialiased">
        <AuthProvider>
          <PipProvider>
            <UploadProvider>
              <PrivacyOverlay />
              <DecoyInterfaceWrapper />
              {children}
              <UploadDock />
              <UploadModal />
            </UploadProvider>
          </PipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
