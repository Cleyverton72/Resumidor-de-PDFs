import { z } from "zod/v4";

/** Valida e projeta os resultados da execução na resposta pública do conector. */
export function connectorResponse(result: unknown): Response {
  try {
    // Mantém sob demanda a análise exclusiva do servidor para que a interface de recuperação do cliente possa removê-la do pacote.
    const requestId = z
      .string()
      .regex(/^[A-Za-z0-9._:-]{1,128}$/)
      .optional()
      .catch(undefined);
    const envelope = {
      error: z.never().optional(),
      content: z.never().optional(),
      structuredContent: z.never().optional(),
      isError: z.never().optional(),
      requestId,
    };
    const content = z.object({
      content: z.array(z.object({ type: z.string() }).catchall(z.json())),
      structuredContent: z.json().optional(),
      isError: z.never().optional(),
      error: z.never().optional(),
    });
    const failure = z.object({
      ...envelope,
      status: z
        .string()
        .min(1)
        .refine((value) => value !== "success"),
      message: z.string().min(1),
      retryAfterMs: z.number().int().nonnegative().safe().optional(),
      result: content.optional(),
    });
    const success = z.object({
      ...envelope,
      status: z.literal("success"),
      result: content,
      message: z.never().optional(),
      retryAfterMs: z.never().optional(),
    });
    const schema =
      result !== null &&
      typeof result === "object" &&
      "status" in result &&
      result.status === "success"
        ? success
        : failure;
    const parsed = schema.safeParse(result);
    if (parsed.success) {
      // Assim como no contrato de vinculação, o status do JSON determina o resultado.
      return Response.json(parsed.data, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  } catch {
    // Valores cíclicos ou não serializáveis do ambiente de execução também não são confirmados.
  }
  return Response.json(
    {
      status: "upstream_error",
      message:
        "The app did not return a confirmed result. The action may have completed; check before trying again.",
    },
    { status: 502, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Apenas apresentação. Quem chama fornece a URL SIWC do projeto inicial gerada pelo servidor. */
export function connectorErrorRecovery(
  error: { status: string; message: string },
  connectorName: string,
  reconnectHref: string,
): { message: string; action?: { label: string; href: string } } {
  if (error.status === "reauthentication_required") {
    return {
      message: error.message,
      action: { label: `Connect ${connectorName}`, href: reconnectHref },
    };
  }
  // Outros resultados não comprovam que falta consentimento nem que repetir a chamada seja seguro.
  return { message: error.message };
}
