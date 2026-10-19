# Síntese — Resumidor de PDFs e textos

Aplicação em React que recebe texto, PDF ou TXT e gera:

- resumo com nível de detalhamento ajustável;
- tópicos-chave;
- perguntas de revisão;
- estimativa de palavras e tempo de leitura.

O processamento é feito no navegador. O arquivo não é armazenado.

## Versão HTML para Live Server

Além da versão em React, o projeto possui uma versão independente formada por `index.html`, `styles.css` e `script.js`.

Para abrir essa versão, clique com o botão direito em `index.html` no VS Code e escolha **Open with Live Server**. Ela não precisa dos comandos do React.

## Abrir e executar no VS Code

1. Abra esta pasta no VS Code.
2. Abra o terminal integrado em **Terminal > Novo Terminal**.
3. Instale as dependências:

```bash
npm install
```

4. Inicie o projeto:

```bash
npm run dev
```

5. Abra o endereço exibido no terminal, normalmente `http://localhost:5173`.

Requisito: Node.js 22.13 ou superior.

## Arquivos principais

```text
sintese-react/
├── app/
│   ├── page.tsx        # Tela, estados e lógica do resumidor
│   ├── layout.tsx      # Metadados e idioma da aplicação
│   └── globals.css     # Cores, tipografia e estilos globais
├── components/ui/      # Componentes React reutilizáveis
├── lib/                # Funções auxiliares
├── public/
│   └── favicon.svg     # Ícone da aplicação
├── package.json        # Dependências e comandos
└── README.md           # Este guia
```

## Como funciona

- Textos são analisados localmente por frequência de termos e relevância das frases.
- PDFs usam o PDF.js carregado no navegador para extrair o texto.
- O controle **Nível de detalhe** altera a quantidade de frases do resumo.
- As abas exibem resumo, tópicos e perguntas de revisão.

## Onde alterar

- Interface e lógica: `app/page.tsx`
- Tema visual: `app/globals.css`
- Título e descrição: `app/layout.tsx`
- Ícone: `public/favicon.svg`

## Build de produção

```bash
npm run build
```
