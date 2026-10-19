// Informa ao Next.js que este arquivo usa recursos do navegador e estado do React.
"use client";

// Hooks do React usados para estado, referências, cálculos e efeitos colaterais.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Ícones visuais usados nos botões e nas áreas da interface.
import { BookOpenCheck, Check, ChevronRight, Clipboard, FileText, ListChecks, LoaderCircle, RotateCcw, Sparkles, Upload, X } from "lucide-react";
// Biblioteca responsável pelas mensagens rápidas de sucesso e erro.
import { toast } from "sonner";
// Componentes de interface reutilizáveis.
import { Button } from "@/components/ui/button";
// Importa a barra deslizante usada para escolher o nível de detalhe.
import { Slider } from "@/components/ui/slider";
// Importa o seletor e as peças usadas para montar a lista de idiomas.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Importa as peças usadas para montar as três abas do resultado.
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Importa o componente que desenha as notificações na tela.
import { Toaster } from "@/components/ui/sonner";

// Define exatamente quais informações um resumo pronto deve possuir.
type Result = { summary: string; topics: string[]; questions: string[]; originalWords: number; readingMinutes: number };
// Palavras muito comuns que não ajudam a descobrir os assuntos principais.
const STOP_WORDS = new Set("a o as os de da do das dos e em para por com que um uma uns umas no na nos nas ao aos à às se ou como mais mas foi são ser sua seu suas seus já também entre sobre até isso esse esta este essa aquela aquele tem ter muito quando onde porque pelo pela pelos pelas eu você nós eles elas não sim".split(" "));
// Remove espaços duplicados e espaços extras do começo e do fim.
const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();

// Analisa o texto e devolve resumo, tópicos, perguntas e estatísticas.
function summarizeText(value: string, detail: number): Result {
  // Normaliza o texto recebido.
  const text = cleanText(value);
  // Separa o texto em palavras, aceitando letras, números, apóstrofos e hífens.
  const words = text.match(/[\p{L}\p{N}'-]+/gu) ?? [];
  // Separa o conteúdo em frases usando ponto, exclamação e interrogação.
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  // Guarda quantas vezes cada palavra relevante aparece.
  const frequency = new Map<string, number>();
  // Percorre todas as palavras para construir o mapa de frequência.
  words.forEach((word) => {
    // Padroniza a palavra em minúsculas e remove símbolos.
    const key = word.toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]/gu, "");
    // Conta somente palavras úteis com mais de três caracteres.
    if (key.length > 3 && !STOP_WORDS.has(key)) frequency.set(key, (frequency.get(key) ?? 0) + 1);
  });
  // Calcula uma pontuação para cada frase de acordo com as palavras frequentes.
  const ranked = sentences.map((sentence, index) => {
    // Separa as palavras existentes dentro da frase atual.
    const keys = sentence.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu) ?? [];
    // Devolve a frase, sua posição original e sua pontuação de importância.
    return { sentence, index, score: keys.reduce((sum, key) => sum + (frequency.get(key) ?? 0), 0) / Math.max(keys.length, 1) };
  // Ordena da frase mais importante para a menos importante.
  }).sort((a, b) => b.score - a.score);
  // Converte o nível escolhido pelo usuário em uma proporção de frases.
  const ratio = detail <= 30 ? 0.2 : detail <= 70 ? 0.34 : 0.48;
  // Limita o resumo entre uma e seis frases.
  const keep = Math.max(1, Math.min(6, Math.ceil(sentences.length * ratio)));
  // Seleciona as melhores frases e restaura a ordem original do texto.
  const summary = ranked.slice(0, keep).sort((a, b) => a.index - b.index).map(({ sentence }) => sentence).join(" ");
  // Escolhe as seis palavras relevantes mais frequentes como tópicos-chave.
  const topics = [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([word]) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1));
  // Cria até quatro perguntas de revisão a partir das melhores frases e tópicos.
  const questions = ranked.slice(0, 4).map(({ sentence }, index) => {
    // Escolhe um tópico para servir como assunto da pergunta atual.
    const topic = topics[index % Math.max(topics.length, 1)] ?? "ideia central";
    // Seleciona um modelo diferente de pergunta para cada posição.
    return [
      `Como você explicaria ${topic.toLocaleLowerCase("pt-BR")} com suas próprias palavras?`,
      `Qual é a relação entre ${topic.toLocaleLowerCase("pt-BR")} e a ideia central do texto?`,
      `Que exemplo prático ajuda a compreender ${topic.toLocaleLowerCase("pt-BR")}?`,
      `Qual conclusão pode ser tirada a partir de: “${sentence.slice(0, 80)}${sentence.length > 80 ? "…" : ""}”?`,
    ][index];
  });
  // Retorna todos os dados que serão mostrados na tela.
  return { summary, topics, questions, originalWords: words.length, readingMinutes: Math.max(1, Math.ceil(words.length / 220)) };
}

// Componente principal da página.
export default function Home() {
  // Texto digitado ou extraído do arquivo.
  const [text, setText] = useState("");
  // Nome do arquivo enviado.
  const [fileName, setFileName] = useState("");
  // Nível de detalhamento; o Slider trabalha com uma lista de números.
  const [detail, setDetail] = useState([55]);
  // Idioma selecionado na interface.
  const [language, setLanguage] = useState("pt-BR");
  // Resultado atual; começa vazio.
  const [result, setResult] = useState<Result | null>(null);
  // Controla o indicador de carregamento e bloqueia ações repetidas.
  const [loading, setLoading] = useState(false);
  // Informa se um arquivo está sendo arrastado sobre a área de upload.
  const [dragging, setDragging] = useState(false);
  // Referência para abrir e limpar o campo de arquivo invisível.
  const fileRef = useRef<HTMLInputElement>(null);
  // Recalcula a quantidade de palavras apenas quando o texto muda.
  const wordCount = useMemo(() => text.trim().split(/\s+/).filter(Boolean).length, [text]);

  // Valida o conteúdo e executa o algoritmo de resumo.
  const generate = useCallback(async (source = text) => {
    // Impede a geração quando o conteúdo é curto demais.
    if (cleanText(source).length < 80) return void toast.error("Adicione um texto um pouco maior para gerar um bom resumo.");
    // Ativa o estado visual de processamento.
    setLoading(true);
    // Pequena espera para tornar o estado visual de análise perceptível.
    await new Promise((resolve) => setTimeout(resolve, 650));
    // Salva na tela o resultado devolvido pelo algoritmo.
    setResult(summarizeText(source, detail[0]));
    // Desativa o estado visual de processamento.
    setLoading(false);
  }, [detail, text]);

  // Lê um PDF ou TXT selecionado pelo usuário.
  const readFile = useCallback(async (file?: File) => {
    // Para a função se nenhum arquivo foi informado.
    if (!file) return;
    // Recusa arquivos maiores que 15 megabytes.
    if (file.size > 15 * 1024 * 1024) return void toast.error("O arquivo deve ter no máximo 15 MB.");
    // Ativa o carregamento enquanto o documento é lido.
    setLoading(true);
    // Inicia o bloco que poderá capturar erros de leitura.
    try {
      // Cria a variável que receberá todo o texto do documento.
      let content = "";
      // PDFs precisam ser interpretados pelo PDF.js; TXT usa a API nativa File.text().
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        // Tipos mínimos usados para descrever somente as partes necessárias do PDF.js.
        type PdfText = { items: Array<{ str?: string }> };
        // Descreve uma página que consegue devolver seu conteúdo textual.
        type PdfPage = { getTextContent(): Promise<PdfText> };
        // Descreve o documento, sua quantidade de páginas e a leitura de cada página.
        type PdfDocument = { numPages: number; getPage(page: number): Promise<PdfPage> };
        // Descreve o módulo PDF.js carregado dinamicamente.
        type PdfModule = { GlobalWorkerOptions: { workerSrc: string }; getDocument(options: { data: ArrayBuffer }): { promise: Promise<PdfDocument> } };
        // Importa o PDF.js no navegador somente quando um PDF é realmente enviado.
        const runtimeImport = new Function("url", "return import(url)") as (url: string) => Promise<PdfModule>;
        // Baixa e carrega a biblioteca principal do PDF.js.
        const pdfjs = await runtimeImport("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/legacy/build/pdf.mjs");
        // Informa ao PDF.js onde encontrar seu processo auxiliar.
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/legacy/build/pdf.worker.min.mjs";
        // Converte o arquivo em bytes e abre o documento PDF.
        const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        // Cria uma lista vazia para armazenar o texto de cada página.
        const pages: string[] = [];
        // Percorre todas as páginas e junta cada fragmento de texto encontrado.
        for (let n = 1; n <= document.numPages; n += 1) {
          // Obtém a página indicada pelo contador.
          const page = await document.getPage(n);
          // Pede ao PDF.js todos os fragmentos de texto da página.
          const pageText = await page.getTextContent();
          // Junta os fragmentos e adiciona o resultado à lista de páginas.
          pages.push(pageText.items.map((item) => item.str ?? "").join(" "));
        }
        // Junta todas as páginas, separando cada uma com duas quebras de linha.
        content = pages.join("\n\n");
      // Se não for PDF, lê diretamente como arquivo de texto.
      } else content = await file.text();
      // Atualiza a tela com o conteúdo extraído e descarta um resultado antigo.
      setText(content); setFileName(file.name); setResult(null);
      // Mostra uma mensagem verde de sucesso.
      toast.success("Conteúdo extraído. Revise o texto e gere o resumo.");
    // Se alguma etapa falhar, informa o problema ao usuário.
    } catch { toast.error("Não foi possível ler este arquivo. Tente outro PDF ou cole o texto."); }
    // Sempre desliga o carregamento, com sucesso ou com erro.
    finally { setLoading(false); }
  }, []);

  // Volta a aplicação ao estado inicial.
  const reset = () => { setText(""); setFileName(""); setResult(null); if (fileRef.current) fileRef.current.value = ""; };
  // Copia um conteúdo para a área de transferência e confirma a ação.
  const copy = async (value: string, label: string) => { await navigator.clipboard.writeText(value); toast.success(`${label} copiado.`); };

  // Registra uma ferramenta opcional para navegadores compatíveis com WebMCP.
  useEffect(() => {
    // Obtém o registro de ferramentas do navegador, quando ele existir.
    const context = typeof document === "undefined" ? undefined : document.modelContext;
    // Encerra o efeito em navegadores que ainda não oferecem WebMCP.
    if (!context?.registerTool) return;
    // Cria um controlador para remover a ferramenta depois.
    const lifecycle = new AbortController();
    // Registra a ferramenta e aceita tanto retorno imediato quanto Promise.
    void Promise.resolve(context.registerTool({
      // Nome técnico e nome visível da ferramenta.
      name: "summarize_text", title: "Resumir texto",
      // Explica para agentes quando a ferramenta deve ser usada.
      description: "Insere um texto e gera resumo, tópicos-chave e perguntas de revisão.",
      // Define que a entrada precisa conter uma propriedade text válida.
      inputSchema: { type: "object", properties: { text: { type: "string", minLength: 80 } }, required: ["text"], additionalProperties: false },
      // Indica que a ferramenta altera a tela e recebe conteúdo do usuário.
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      // Função executada quando um agente chama a ferramenta.
      async execute(input: unknown) {
        // Extrai a propriedade text sem confiar no formato recebido.
        const value = (input as { text?: unknown })?.text;
        // Recusa qualquer entrada que não seja um texto válido.
        if (typeof value !== "string" || cleanText(value).length < 80) throw new Error("O texto precisa ter pelo menos 80 caracteres.");
        // Coloca o texto na tela e remove o nome de um arquivo antigo.
        setText(value); setFileName("");
        // Gera e salva o novo resultado.
        const next = summarizeText(value, detail[0]); setResult(next);
        // Devolve uma confirmação curta para quem chamou a ferramenta.
        return { status: "concluído", topics: next.topics.length, questions: next.questions.length };
      },
    // Liga o registro ao controlador criado acima.
    }, { signal: lifecycle.signal })).catch(() => undefined);
    // Remove a ferramenta quando o componente for desmontado ou recriado.
    return () => lifecycle.abort();
  }, [detail]);

  // A partir daqui começa a interface visual em JSX.
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Cabeçalho com marca e botão para reiniciar o trabalho. */}
      <header className="border-b border-white/10 bg-[#111a30] text-white">
        {/* Limita a largura e posiciona marca e botão nas duas extremidades. */}
        <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          {/* Agrupa o ícone e os textos da marca. */}
          <div className="flex items-center gap-3">
            {/* Desenha o quadrado verde que contém o ícone de livro. */}
            <span className="grid size-9 place-items-center rounded-xl bg-[#d7ff5f] text-[#17233d]"><BookOpenCheck className="size-5" aria-hidden="true" /></span>
            {/* Mostra o nome e a pequena descrição da aplicação. */}
            <div><p className="text-lg font-bold tracking-tight">Síntese</p><p className="hidden text-xs text-white/55 sm:block">Do conteúdo à compreensão</p></div>
          </div>
          {/* Executa reset quando o usuário pede um novo resumo. */}
          <Button variant="ghost" className="text-white/75 hover:bg-white/10 hover:text-white" onClick={reset}><RotateCcw className="size-4" />Novo resumo</Button>
        </div>
      </header>

      {/* Área principal com título, entrada de conteúdo e resultados. */}
      <section className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mb-8 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          {/* Agrupa o rótulo da seção e o título principal. */}
          <div><p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#5758c9]"><Sparkles className="size-4" /> Espaço de estudo</p><h1 className="max-w-2xl text-3xl font-bold tracking-[-0.035em] text-[#17233d] sm:text-4xl">Menos páginas. Mais clareza.</h1></div>
          {/* Explica como os documentos são processados. */}
          <p className="max-w-md text-sm leading-6 text-slate-500">Cole um texto ou envie um PDF. Seu arquivo é processado no navegador e não fica armazenado.</p>
        </div>

        {/* No desktop há duas colunas; em telas menores elas ficam empilhadas. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {/* Coluna esquerda: upload, texto e configurações. */}
          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(23,35,61,0.07)]">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-6"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold text-[#17233d]">Conteúdo de origem</p><p className="mt-1 text-sm text-slate-500">PDF ou texto simples</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{wordCount.toLocaleString("pt-BR")} palavras</span></div></div>
            <div className="p-5 sm:p-6">
              {/* Campo invisível acionado pela área de upload. */}
              <input ref={fileRef} type="file" accept="application/pdf,text/plain,.pdf,.txt" className="sr-only" onChange={(event) => readFile(event.target.files?.[0])} />
              {/* Se não há arquivo mostra o upload; se há, mostra o cartão do arquivo. */}
              {!fileName ? (
                <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files[0]); }} className={`mb-4 flex w-full items-center gap-4 rounded-2xl border border-dashed p-4 text-left transition ${dragging ? "border-[#5758c9] bg-[#f0f0ff]" : "border-slate-300 bg-slate-50 hover:border-[#7b7cff] hover:bg-[#f7f7ff]"}`}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-[#5758c9] shadow-sm"><Upload className="size-5" /></span>
                  <span className="min-w-0"><span className="block text-sm font-semibold text-[#17233d]">Enviar PDF ou TXT</span><span className="mt-0.5 block text-xs text-slate-500">Arraste aqui ou clique para escolher · até 15 MB</span></span>
                </button>
              ) : (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#cfd0ff] bg-[#f5f5ff] p-4"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#5758c9]"><FileText className="size-5" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#17233d]">{fileName}</p><p className="text-xs text-slate-500">Conteúdo extraído</p></div></div><Button variant="ghost" size="icon" aria-label="Remover arquivo" onClick={reset}><X className="size-4" /></Button></div>
              )}
              {/* Campo onde o usuário pode colar ou revisar o conteúdo extraído. */}
              <div className="relative">
                <textarea value={text} onChange={(event) => { setText(event.target.value); setResult(null); }} placeholder="Ou cole seu texto aqui…" className="min-h-[260px] w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-base leading-7 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#7b7cff] focus:ring-4 focus:ring-[#7b7cff]/10" aria-label="Texto para resumir" />
                {text && <button type="button" onClick={() => { setText(""); setResult(null); }} className="absolute bottom-3 right-3 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-400 shadow-sm hover:text-slate-700">Limpar</button>}
              </div>
              {/* Controles de nível de detalhe e idioma. */}
              <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_160px]">
                <div><div className="mb-3 flex items-center justify-between text-sm"><span className="font-medium text-[#17233d]">Nível de detalhe</span><span className="font-semibold text-[#5758c9]">{detail[0] <= 30 ? "Essencial" : detail[0] <= 70 ? "Equilibrado" : "Detalhado"}</span></div><Slider value={detail} onValueChange={setDetail} min={10} max={100} step={5} aria-label="Nível de detalhe" /></div>
                <Select value={language} onValueChange={setLanguage}><SelectTrigger className="h-11 w-full rounded-xl" aria-label="Idioma do resumo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pt-BR">Português</SelectItem><SelectItem value="en">English</SelectItem><SelectItem value="es">Español</SelectItem></SelectContent></Select>
              </div>
              {/* Botão principal; muda ícone e texto durante a análise. */}
              <Button size="lg" disabled={loading || wordCount < 12} onClick={() => generate()} className="mt-6 h-12 w-full rounded-xl bg-[#17233d] text-base text-white shadow-[0_10px_26px_rgba(23,35,61,0.2)] hover:bg-[#263654]">{loading ? <LoaderCircle className="size-5 animate-spin" /> : <Sparkles className="size-5 text-[#d7ff5f]" />}{loading ? "Analisando conteúdo…" : "Gerar material de estudo"}</Button>
            </div>
          </section>

          {/* Coluna direita: estado vazio ou material de estudo pronto. */}
          <section className="min-h-[610px] overflow-hidden rounded-[24px] border border-white/10 bg-[#17233d] text-white shadow-[0_22px_60px_rgba(23,35,61,0.2)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 sm:px-6"><div><p className="font-semibold">Seu material</p><p className="mt-1 text-sm text-white/50">Pronto para entender e revisar</p></div>{result && <div className="flex items-center gap-2 text-xs font-semibold text-[#d7ff5f]"><Check className="size-4" /> Concluído</div>}</div>
            {/* Sem resultado, mostra instruções; com resultado, mostra as abas. */}
            {!result ? (
              <div className="grid min-h-[520px] place-items-center p-8 text-center"><div className="max-w-sm"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/8 text-[#d7ff5f]"><ListChecks className="size-7" /></span><h2 className="mt-5 text-xl font-semibold">Tudo importante, no lugar certo</h2><p className="mt-2 text-sm leading-6 text-white/55">O resumo, os conceitos principais e as perguntas de revisão aparecerão aqui.</p><div className="mx-auto mt-7 grid max-w-xs gap-2 text-left text-sm text-white/65">{["Visão geral objetiva", "Tópicos para memorizar", "Perguntas para testar o aprendizado"].map((item) => <div key={item} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5"><ChevronRight className="size-4 text-[#7b7cff]" /> {item}</div>)}</div></div></div>
            ) : (
              <Tabs defaultValue="summary" className="p-5 sm:p-6"><TabsList className="h-11 w-full rounded-xl bg-white/7 p-1"><TabsTrigger value="summary" className="rounded-lg text-white/55 data-[state=active]:bg-white data-[state=active]:text-[#17233d]">Resumo</TabsTrigger><TabsTrigger value="topics" className="rounded-lg text-white/55 data-[state=active]:bg-white data-[state=active]:text-[#17233d]">Tópicos</TabsTrigger><TabsTrigger value="questions" className="rounded-lg text-white/55 data-[state=active]:bg-white data-[state=active]:text-[#17233d]">Revisão</TabsTrigger></TabsList>
                <div className="mt-5 min-h-[410px] rounded-2xl bg-white p-5 text-[#17233d] sm:p-6">
                  {/* Primeira aba: resumo e estatísticas. */}
                  <TabsContent value="summary"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#5758c9]">Resumo gerado</p><h2 className="mt-2 text-xl font-bold tracking-tight">Visão geral</h2></div><Button variant="ghost" size="icon" aria-label="Copiar resumo" onClick={() => copy(result.summary, "Resumo")}><Clipboard className="size-4" /></Button></div><p className="mt-5 text-base leading-8 text-slate-600">{result.summary}</p><div className="mt-7 flex flex-wrap gap-2 border-t border-slate-100 pt-5 text-xs font-semibold text-slate-500"><span className="rounded-full bg-slate-100 px-3 py-1.5">{result.originalWords} palavras</span><span className="rounded-full bg-slate-100 px-3 py-1.5">{result.readingMinutes} min de leitura original</span></div></TabsContent>
                  {/* Segunda aba: lista numerada de tópicos-chave. */}
                  <TabsContent value="topics"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#5758c9]">Ideias centrais</p><h2 className="mt-2 text-xl font-bold tracking-tight">Tópicos-chave</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{result.topics.map((topic, index) => <div key={topic} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#ededff] text-sm font-bold text-[#5758c9]">{index + 1}</span><span className="font-semibold">{topic}</span></div>)}</div></TabsContent>
                  {/* Terceira aba: perguntas para revisão ativa. */}
                  <TabsContent value="questions"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#5758c9]">Recuperação ativa</p><h2 className="mt-2 text-xl font-bold tracking-tight">Perguntas de revisão</h2><ol className="mt-5 space-y-3">{result.questions.map((question, index) => <li key={question} className="flex gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600"><span className="font-bold text-[#5758c9]">{String(index + 1).padStart(2, "0")}</span>{question}</li>)}</ol></TabsContent>
                </div>
              </Tabs>
            )}
          </section>
        </div>
        {/* Rodapé com informações de privacidade e formato. */}
        <footer className="mt-6 flex flex-col justify-between gap-2 text-xs text-slate-400 sm:flex-row"><p>Processamento local · seus documentos permanecem no seu dispositivo</p><p>PDF e TXT · até 15 MB</p></footer>
      </section>
      {/* Área global onde aparecem as mensagens verdes e vermelhas. */}
      <Toaster position="top-center" richColors />
    </main>
  );
}
