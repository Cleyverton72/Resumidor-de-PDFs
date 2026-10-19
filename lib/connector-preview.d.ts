declare module "virtual:sites-connector-preview" {
  const binding: import("./connector-contract.mjs").ConnectorBinding;
  export default binding;
}

// Somente a prévia local usa uma vinculação de ambiente. Sites hospedados recebem o
// recurso limitado à requisição por ctx.props.CONNECTORS em sites-worker.ts.
declare namespace Cloudflare {
  interface Env {
    CONNECTORS?: import("./connector-contract.mjs").ConnectorBinding;
  }
}
