// Rótulos das ferramentas que o agente de IA pode usar — módulo puro, seguro
// para componente cliente (o registro importa código de servidor).
export const AI_TOOL_LABELS: Record<string, string> = {
  get_lead_context: "Consultar dados do lead",
  update_contact: "Atualizar cadastro do contato",
  update_deal: "Atualizar valor/temperatura da negociação",
  move_deal_stage: "Mover lead de etapa",
  add_note: "Registrar nota no histórico",
  create_task: "Criar tarefa para o responsável",
  save_qualification: "Salvar qualificação (extração estruturada)",
  search_knowledge: "Consultar base de conhecimento",
  handoff_to_human: "Transferir para humano",
};

export const AI_TOOL_NAMES = Object.keys(AI_TOOL_LABELS);
