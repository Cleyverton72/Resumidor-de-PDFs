import { WorkerEntrypoint } from "cloudflare:workers";
import binding from "virtual:sites-connector-preview";

// Destino de RPC somente local. O ponto de entrada do Site o limita a cada requisição;
// o adaptador do Node encaminha cada chamada ao agente responsável.
export class ConnectorPreview extends WorkerEntrypoint {
  async getContext() {
    return binding.getContext?.() ?? { status: "binding_unavailable" };
  }

  async invoke(connectorId, actionName, args) {
    return binding.invoke(connectorId, actionName, args);
  }
}
export default { fetch() { return new Response("Not found", { status: 404 }); } };
