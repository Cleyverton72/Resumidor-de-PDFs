import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { JSONRPCClient } from "json-rpc-2.0";
import { createPreviewBinding } from "./host-binding.mjs";
import {
  driverMessageSchema,
  grantsSchema,
  sessionOptionsSchema,
} from "./protocol.mjs";

// O agente inicia este script pela ferramenta de terminal depois de criar um Site local
// e selecionar ações de leitura dos conectores, seguindo references/connector-preview.md:
//   node <site-directory>/scripts/connector-preview/connector-preview-session.mjs <site-directory> <grants.json>
// Durante o ciclo de desenvolvimento do agente, a prévia do Site grava requisições em uma pasta compartilhada.
// Este script verifica cada requisição com host-binding.mjs e então pede ao agente, pela
// saída padrão, que chame o conector. O agente devolve o resultado pela entrada padrão,
// e este script o grava de volta para o Site. O agente interrompe o script quando a
// prévia termina; nem o navegador nem um Site publicado iniciam este processo.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    concurrency: { type: "string" },
    "timeout-ms": { type: "string" },
    "lifetime-ms": { type: "string" },
    "max-calls": { type: "string" },
  },
});
const [project, grantsFile] = positionals;
if (positionals.length !== 2 || !path.isAbsolute(project)) {
  throw new Error(
    "Usage: node connector-preview-session.mjs <absolute-site-directory> <grants.json> [--concurrency 64] [--timeout-ms 120000] [--lifetime-ms N] [--max-calls N]",
  );
}
const limits = sessionOptionsSchema.parse(
  Object.fromEntries(
    [
      ["maxConcurrent", values.concurrency],
      ["timeoutMs", values["timeout-ms"]],
      ["lifetimeMs", values["lifetime-ms"]],
      ["maxCalls", values["max-calls"]],
    ]
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, Number(value)]),
  ),
);
const grants = grantsSchema.parse(
  JSON.parse(await readFile(grantsFile, "utf8")),
);
const root = path.join(project, ".sites-runtime", "connector-preview");
const id = randomUUID();
const directory = path.join(root, id);
const descriptor = path.join(root, "session.json");
const active = new Set();
const rpc = new JSONRPCClient(
  (message) =>
    new Promise((resolve, reject) => {
      process.stdout.write(`${JSON.stringify(message)}\n`, (error) =>
        error ? reject(error) : resolve(),
      );
    }),
);
const emit = (method, params) => rpc.notify(method, params);
let closing = false;
const binding = createPreviewBinding({
  ...limits,
  tools: grants.map((grant) => ({
    ...grant,
    async invoke(args) {
      const requestId = randomUUID();
      // O JSON-RPC controla a associação das respostas e a limpeza de chamadas pendentes. Não define
      // prazo de RPC aqui: chamadas incertas ocupam sua vaga até serem concluídas.
      const response = await rpc.requestAdvanced({
        jsonrpc: "2.0",
        id: requestId,
        method: "invoke",
        params: {
          connectorId: grant.connectorId,
          actionName: grant.actionName,
          arguments: args,
        },
      });
      if (!closing)
        emit("receipt", { id: requestId, at: new Date().toISOString() });
      if (response.error)
        throw new Error("The agent did not confirm a connector result.");
      return response.result;
    },
  })),
});
await mkdir(directory, { recursive: true, mode: 0o700 });
try {
  // Um responsável por projeto. Uma sessão interrompida deve ser limpa explicitamente;
  // nunca assume silenciosamente a sessão de conectores de outro agente.
  await writeFile(
    descriptor,
    JSON.stringify({
      id,
      expiresAt:
        limits.lifetimeMs === undefined ? null : Date.now() + limits.lifetimeMs,
      timeoutMs: limits.timeoutMs,
      connectorIds: [...new Set(grants.map((grant) => grant.connectorId))],
    }),
    { flag: "wx", mode: 0o600 },
  );
} catch (error) {
  binding.close();
  await rm(directory, { recursive: true, force: true });
  throw error;
}
async function serve(name) {
  active.add(name);
  try {
    const body = await readFile(path.join(directory, name), "utf8");
    const response = await binding.fetch(
      new Request("http://preview/invoke", { method: "POST", body }),
    );
    if (!closing) {
      const output = path.join(
        directory,
        name.replace(".request", ".response"),
      );
      await writeFile(`${output}.tmp`, await response.text(), { mode: 0o600 });
      await rename(`${output}.tmp`, output);
    }
  } catch {
    // Quem atingiu o fim do prazo pode remover sua requisição. A chamada nativa nunca é repetida.
  } finally {
    await rm(path.join(directory, name), { force: true });
    active.delete(name);
  }
}
let scanning = false;
// A caixa de mensagens atravessa espaços de rede pela pasta compartilhada do projeto.
// Renomeações atômicas impedem que o leitor veja mensagens gravadas parcialmente.
const poller = setInterval(async () => {
  if (closing || scanning) return;
  scanning = true;
  try {
    for (const name of await readdir(directory)) {
      if (/^[0-9a-f-]{36}\.request$/.test(name) && !active.has(name))
        void serve(name);
    }
  } catch (error) {
    if (!closing) {
      emit("session_error", { code: error.code });
      void close();
    }
  } finally {
    scanning = false;
  }
}, 50);
const expiry =
  limits.lifetimeMs === undefined
    ? undefined
    : setTimeout(() => {
        void close();
      }, limits.lifetimeMs);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = createInterface({ input: process.stdin, terminal: false });
input.on("line", (line) => {
  try {
    const message = driverMessageSchema.parse(JSON.parse(line));
    if (message.method === "stop") {
      void close();
      return;
    }
    rpc.receive(message);
  } catch {
    emit("invalid_driver_message");
  }
});
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(poller);
  clearTimeout(expiry);
  binding.close();
  rpc.rejectAllPendingRequests("The connector preview session ended.");
  await rm(descriptor, { force: true });
  await rm(directory, { recursive: true, force: true });
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  input.close();
  process.stdin.pause();
  emit("closed");
}
input.on("close", () => {
  void close();
});
process.stdin.on("data", (chunk) => {
  if (chunk.includes(3)) void close();
});
process.on("SIGTERM", () => {
  void close();
});
process.on("SIGINT", () => {
  void close();
});
emit("ready", {
  expiresInSeconds:
    limits.lifetimeMs === undefined ? null : limits.lifetimeMs / 1000,
  maxCalls: limits.maxCalls ?? null,
  maxConcurrent: limits.maxConcurrent,
  timeoutMs: limits.timeoutMs,
});
