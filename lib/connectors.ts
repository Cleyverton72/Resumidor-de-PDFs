import { createConnectors } from "./connector-contract.mjs";
import { getConnectorBinding } from "./connector-context";

/** Mantém o contexto da chamada nesta requisição; nunca o armazena entre visitantes. */
export function connectorsForRequest() {
  return createConnectors(getConnectorBinding());
}
export type {
  ConnectorContext,
  ConnectorResult,
  ConnectorFailureStatus,
  Json,
} from "./connector-contract.mjs";
