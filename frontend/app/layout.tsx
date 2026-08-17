import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { PrivacyOverlay } from '../components/PrivacyOverlay';

export const metadata: Metadata = {
  title: 'Private Personal Video Library',
  description: 'Self-hosted encrypted personal video library',
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
    <html lang="en" className="dark">
      <body className="bg-background text-slate-100 min-h-screen flex flex-col font-sans">
        <AuthProvider>
          <PrivacyOverlay />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
