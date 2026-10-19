// Guarda palavras comuns que não ajudam a identificar os assuntos principais.
const STOP_WORDS = new Set(["a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e", "é", "em", "entre", "essa", "esse", "esta", "este", "foi", "mais", "mas", "na", "nas", "no", "nos", "não", "o", "os", "ou", "para", "pela", "pelo", "por", "que", "se", "sem", "ser", "são", "sua", "suas", "seu", "seus", "um", "uma", "the", "and", "for", "from", "that", "this", "with"]);

// Localiza uma vez cada elemento usado pelo JavaScript.
const fileInput = document.querySelector("#fileInput");
const dropzone = document.querySelector("#dropzone");
const fileCard = document.querySelector("#fileCard");
const fileName = document.querySelector("#fileName");
const fileSize = document.querySelector("#fileSize");
const removeFileButton = document.querySelector("#removeFileButton");
const sourceText = document.querySelector("#sourceText");
const wordCount = document.querySelector("#wordCount");
const detailLevel = document.querySelector("#detailLevel");
const detailLabel = document.querySelector("#detailLabel");
const summarizeButton = document.querySelector("#summarizeButton");
const resetButton = document.querySelector("#resetButton");
const emptyState = document.querySelector("#emptyState");
const resultArea = document.querySelector("#resultArea");
const doneBadge = document.querySelector("#doneBadge");
const summaryText = document.querySelector("#summaryText");
const topicList = document.querySelector("#topicList");
const questionList = document.querySelector("#questionList");
const originalWords = document.querySelector("#originalWords");
const readingTime = document.querySelector("#readingTime");
const copyButton = document.querySelector("#copyButton");
const toast = document.querySelector("#toast");

// Guarda o temporizador usado para esconder mensagens rápidas.
let toastTimer;

// Remove espaços repetidos e espaços extras das extremidades.
function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

// Exibe uma mensagem temporária de sucesso ou erro.
function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

// Converte o tamanho do arquivo para uma unidade fácil de ler.
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Conta as palavras do texto atual e atualiza a interface.
function updateWordCount() {
  const words = cleanText(sourceText.value).match(/[\p{L}\p{N}]+/gu) || [];
  wordCount.textContent = `${words.length} ${words.length === 1 ? "palavra" : "palavras"}`;
}

// Analisa as frases e produz resumo, tópicos e perguntas.
function analyzeText(rawText, level) {
  // Normaliza o conteúdo recebido.
  const text = cleanText(rawText);
  // Separa o conteúdo em palavras e frases.
  const words = text.match(/[\p{L}\p{N}'’-]+/gu) || [];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(cleanText).filter(Boolean) || [text];
  // Guarda quantas vezes cada palavra importante aparece.
  const frequency = new Map();

  // Percorre as palavras para construir a frequência.
  words.forEach((word) => {
    const normalized = word.toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}-]/gu, "");
    if (normalized.length > 3 && !STOP_WORDS.has(normalized)) {
      frequency.set(normalized, (frequency.get(normalized) || 0) + 1);
    }
  });

  // Calcula a importância de cada frase.
  const ranked = sentences.map((sentence, index) => {
    const sentenceWords = sentence.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}'’-]+/gu) || [];
    const score = sentenceWords.reduce((total, word) => total + (frequency.get(word.replace(/[^\p{L}\p{N}-]/gu, "")) || 0), 0);
    return { sentence, index, score: score / Math.max(1, Math.sqrt(sentenceWords.length)) };
  });

  // Ordena as frases da mais relevante para a menos relevante.
  const orderedByImportance = [...ranked].sort((a, b) => b.score - a.score);
  // Converte o nível escolhido na proporção do texto mantida.
  const ratio = level === 1 ? 0.18 : level === 3 ? 0.42 : 0.28;
  // Limita o resumo entre uma e oito frases.
  const amount = Math.max(1, Math.min(8, Math.ceil(sentences.length * ratio)));
  // Seleciona as frases importantes e restaura a ordem original.
  const summary = orderedByImportance.slice(0, amount).sort((a, b) => a.index - b.index).map((item) => item.sentence).join(" ");
  // Escolhe as palavras mais frequentes como tópicos-chave.
  const topics = [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([word]) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1));
  // Usa assuntos alternativos quando há poucos termos relevantes.
  const safeTopics = topics.length ? topics : ["Ideia principal", "Contexto", "Conclusão"];
  // Cria até quatro perguntas para revisão ativa.
  const questions = orderedByImportance.slice(0, 4).map((item, index) => {
    const topic = safeTopics[index % safeTopics.length];
    const templates = [
      `Como você explicaria ${topic} com suas próprias palavras?`,
      `Qual é a relação entre ${topic} e a ideia principal do texto?`,
      `Quais exemplos ajudam a compreender ${topic}?`,
      `Que conclusão importante pode ser tirada sobre ${topic}?`
    ];
    return templates[index % templates.length];
  });

  // Devolve todos os dados usados para montar o resultado.
  return { summary, topics: safeTopics, questions, originalWords: words.length, readingMinutes: Math.max(1, Math.ceil(words.length / 220)) };
}

// Troca a aba visível no painel de resultado.
function openTab(tabName) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const active = panel.dataset.panel === tabName;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

// Preenche o painel com os dados da análise.
function renderResult(result) {
  summaryText.textContent = result.summary;
  topicList.replaceChildren(...result.topics.map((topic) => Object.assign(document.createElement("li"), { textContent: topic })));
  questionList.replaceChildren(...result.questions.map((question) => Object.assign(document.createElement("li"), { textContent: question })));
  originalWords.textContent = `${result.originalWords} palavras no texto original`;
  readingTime.textContent = `${result.readingMinutes} min de leitura original`;
  emptyState.hidden = true;
  resultArea.hidden = false;
  doneBadge.hidden = false;
  openTab("summary");
}

// Gera o material quando o botão principal é clicado.
function summarize() {
  const text = cleanText(sourceText.value);
  if (text.length < 80) {
    showToast("Adicione um texto um pouco maior para gerar um bom resumo.", true);
    sourceText.focus();
    return;
  }
  summarizeButton.disabled = true;
  summarizeButton.textContent = "Analisando conteúdo…";
  setTimeout(() => {
    renderResult(analyzeText(text, Number(detailLevel.value)));
    summarizeButton.disabled = false;
    summarizeButton.innerHTML = '<span aria-hidden="true">✦</span> Gerar material de estudo';
    showToast("Material de estudo criado com sucesso.");
  }, 450);
}

// Limpa somente os dados do arquivo selecionado.
function clearFile() {
  fileInput.value = "";
  fileCard.hidden = true;
  dropzone.hidden = false;
}

// Lê um PDF ou TXT e coloca seu conteúdo no campo de texto.
async function readFile(file) {
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) {
    showToast("O arquivo deve ter no máximo 15 MB.", true);
    return;
  }
  const isPdf = file.type === "application/pdf" || file.name.toLocaleLowerCase("pt-BR").endsWith(".pdf");
  const isText = file.type === "text/plain" || file.name.toLocaleLowerCase("pt-BR").endsWith(".txt");
  if (!isPdf && !isText) {
    showToast("Escolha um arquivo PDF ou TXT.", true);
    return;
  }

  // Mostra os dados do documento durante a leitura.
  dropzone.hidden = true;
  fileCard.hidden = false;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  summarizeButton.disabled = true;
  summarizeButton.textContent = "Lendo documento…";

  try {
    let extractedText = "";
    // Usa PDF.js quando o arquivo é um PDF.
    if (isPdf) {
      if (!window.pdfjsLib) throw new Error("A biblioteca de PDF não foi carregada.");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = [];
      // Percorre todas as páginas e reúne seus fragmentos de texto.
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => item.str || "").join(" "));
      }
      extractedText = pages.join("\n\n");
    } else {
      // Arquivos TXT são lidos diretamente pelo navegador.
      extractedText = await file.text();
    }
    sourceText.value = extractedText;
    updateWordCount();
    showToast("Documento lido com sucesso.");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível ler o documento. Tente outro arquivo ou cole o texto.", true);
    clearFile();
  } finally {
    summarizeButton.disabled = false;
    summarizeButton.innerHTML = '<span aria-hidden="true">✦</span> Gerar material de estudo';
  }
}

// Volta toda a aplicação ao estado inicial.
function resetApplication() {
  clearFile();
  sourceText.value = "";
  updateWordCount();
  detailLevel.value = "2";
  detailLabel.textContent = "Equilibrado";
  resultArea.hidden = true;
  doneBadge.hidden = true;
  emptyState.hidden = false;
  showToast("Tudo pronto para um novo resumo.");
}

// Liga cada ação da interface à função correspondente.
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => readFile(fileInput.files[0]));
removeFileButton.addEventListener("click", clearFile);
sourceText.addEventListener("input", updateWordCount);
detailLevel.addEventListener("input", () => { detailLabel.textContent = ["Essencial", "Equilibrado", "Detalhado"][Number(detailLevel.value) - 1]; });
summarizeButton.addEventListener("click", summarize);
resetButton.addEventListener("click", resetApplication);
copyButton.addEventListener("click", async () => { await navigator.clipboard.writeText(summaryText.textContent); showToast("Resumo copiado."); });
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => openTab(button.dataset.tab)));

// Destaca a área enquanto um arquivo é arrastado sobre ela.
["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add("is-dragging"); }));
// Remove o destaque quando o arquivo sai da área.
["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove("is-dragging"); }));
// Lê o primeiro arquivo solto na área.
dropzone.addEventListener("drop", (event) => readFile(event.dataTransfer.files[0]));

// Inicia a contagem de palavras quando a página abre.
updateWordCount();
