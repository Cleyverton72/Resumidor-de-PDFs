import { AsyncLocalStorage } from "node:async_hooks";
import type { ConnectorBinding } from "./connector-contract.mjs";

// Captura o recurso confiável antes que o Vinext derive seu contexto de revalidação,
// que não preserva propriedades personalizadas do contexto de execução. Nunca compartilha entre requisições.
const bindings = new AsyncLocalStorage<ConnectorBinding | undefined>();

export function runWithConnectorBinding<T>(
  binding: ConnectorBinding | undefined,
  run: () => T,
): T {
  return bindings.run(binding, run);
}

export function getConnectorBinding(): ConnectorBinding | undefined {
  return bindings.getStore();
}
