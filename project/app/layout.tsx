import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FIRMWAVE - IoT Device Management',
  description: 'Sistema de gestión de dispositivos IoT con actualización OTA',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}