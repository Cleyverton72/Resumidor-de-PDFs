// Tipo usado pelo Next.js para validar título, descrição e ícones da página.
import type { Metadata } from "next";
// Carrega o estilo global para todas as páginas da aplicação.
import "./globals.css";

// Metadados exibidos na aba do navegador e por mecanismos de busca.
export const metadata: Metadata = {
  title: "Síntese — Resuma, entenda, revise",
  description:
    "Transforme textos e PDFs em resumos, tópicos-chave e perguntas de revisão.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

// Layout raiz: envolve qualquer página renderizada pelo Next.js.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Define que o conteúdo do site está em português do Brasil.
    <html lang="pt-BR">
      {/* A classe antialiased melhora a suavização visual das fontes. */}
      <body className="antialiased">{children}</body>
    </html>
  );
}
