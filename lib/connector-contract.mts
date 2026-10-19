export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type ConnectorFailureStatus =
  | "invalid_request"
  | "request_context_expired"
  | "reauthentication_required"
  | "connector_access_disabled"
  | "tool_not_found"
  | "tool_not_allowed"
  | "rate_limited"
  | "tool_error"
  | "upstream_error"
  | "internal_error"
  // Somente no projeto inicial: não há recurso de execução nem sessão de prévia local ativa.
  | "binding_unavailable";

export type ConnectorContent = {
  content: Array<{ type: string; [key: string]: Json }>;
  structuredContent?: Json;
};

// Corresponde ao resultado explícito de chamada do Sites Dispatch, além de binding_unavailable.
export type ConnectorResult =
  | {
      status: "success";
      result: ConnectorContent;
      requestId?: string;
    }
  | {
      status: ConnectorFailureStatus;
      message: string;
      requestId?: string;
      retryAfterMs?: number;
      result?: ConnectorContent;
    };

/** Uma vinculação do lado do servidor fornecida pelo ambiente de execução, nunca pelo navegador. */
export type ConnectorBinding = {
  invoke(
    connectorId: string,
    actionName: string,
    args: { [key: string]: Json },
  ): Promise<ConnectorResult>;
  getContext?(): Promise<ConnectorContext>;
};

/** Política do Site e metadados de ferramentas em cache, não autenticação nem integridade do provedor. */
export type ConnectorContext =
  | {
      status: "success";
      connectors: Array<{
        connectorId: string;
        policy: "enabled" | "disabled";
        tools: Array<{
          actionName: string;
          description?: string;
          inputSchema: Record<string, Json>;
        }> | null;
      }>;
    }
  | {
      status:
        | "request_context_expired"
        | "internal_error"
        | "binding_unavailable"
        | "upstream_error";
    };

/** Use em uma rota de servidor do Site. A seleção da conexão e as credenciais permanecem no host. */
export function createConnectors(binding: ConnectorBinding | undefined) {
  return {
    async getContext(): Promise<ConnectorContext> {
      if (typeof window !== "undefined") {
        throw new Error(
          "Connected apps are only available in Site server routes.",
        );
      }
      try {
        if (!binding?.getContext) return { status: "binding_unavailable" };
        const context = await binding.getContext();
        if (
          context?.status === "success" &&
          Array.isArray(context.connectors)
        ) {
          return {
            status: "success",
            connectors: context.connectors.map((connector) => {
              if (
                !connector ||
                typeof connector.connectorId !== "string" ||
                !["enabled", "disabled"].includes(connector.policy) ||
                (connector.tools !== null && !Array.isArray(connector.tools))
              ) {
                throw new Error("Invalid connector context");
              }
              return {
                connectorId: connector.connectorId,
                policy: connector.policy,
                tools:
                  connector.tools?.map((tool) => {
                    if (
                      !tool ||
                      typeof tool.actionName !== "string" ||
                      (tool.description !== undefined &&
                        typeof tool.description !== "string") ||
                      !tool.inputSchema ||
                      typeof tool.inputSchema !== "object" ||
                      Array.isArray(tool.inputSchema)
                    ) {
                      throw new Error("Invalid connector tool");
                    }
                    return {
                      actionName: tool.actionName,
                      ...(tool.description !== undefined
                        ? { description: tool.description }
                        : {}),
                      inputSchema: tool.inputSchema,
                    };
                  }) ?? null,
              };
            }),
          };
        }
        switch (context?.status) {
          case "request_context_expired":
          case "internal_error":
          case "binding_unavailable":
          case "upstream_error":
            return { status: context.status };
          default:
            return { status: "upstream_error" };
        }
      } catch {
        return { status: "upstream_error" };
      }
    },
    async invoke(
      connectorId: string,
      actionName: string,
      args: { [key: string]: Json },
    ): Promise<ConnectorResult> {
      if (typeof window !== "undefined") {
        throw new Error(
          "Connected apps are only available in Site server routes.",
        );
      }
      if (!binding) {
        return {
          status: "binding_unavailable",
          message:
            "This runtime does not provide connected apps for this request.",
        };
      }
      try {
        // Preserva o status, a mensagem, o resultado e os diagnósticos opcionais do host.
        // Não repete uma chamada após falha de transporte: ela pode ter sido concluída.
        return await binding.invoke(connectorId, actionName, args);
      } catch {
        return {
          status: "upstream_error",
          message:
            "The app did not return a confirmed result. The action may have completed; check before trying again.",
        };
      }
    },
  };
}
