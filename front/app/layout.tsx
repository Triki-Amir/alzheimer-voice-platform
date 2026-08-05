import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "eHealthBridge - Voix Alzheimer IA",
    description: "Plateforme de collecte vocale pour diagnostic Alzheimer",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="fr">
            <body className={`${inter.variable} antialiased`}>
                {children}
            </body>
        </html>
    );
}