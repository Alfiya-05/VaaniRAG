import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VaaniRAG — Voice-Enabled RAG | HH Goa 2026',
  description: 'English-first voice-enabled Retrieval-Augmented Generation system built for HH Goa 2026 Task 2. Ask questions using voice or text and get grounded answers from the MSMARCO knowledge base.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎙️</text></svg>" />
      </head>
      <body>{children}</body>
    </html>
  );
}
