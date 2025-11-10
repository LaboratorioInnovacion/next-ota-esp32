import type React from "react"
import type { Metadata } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { LayoutHeader } from "@/components/layout-header"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Centro Meteorológico - Sistema de Monitoreo",
  description: "Sistema profesional de monitoreo de estaciones meteorológicas",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${geistMono.variable} font-sans antialiased`}>
        <LayoutHeader />
        <main>
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  )
}
