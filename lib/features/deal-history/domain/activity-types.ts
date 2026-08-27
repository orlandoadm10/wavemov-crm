/**
 * Mensagens têm histórico próprio em `whatsapp_messages` e não pertencem à
 * timeline operacional do lead. Os registros continuam em `activity_logs`
 * para auditoria, mas são excluídos da consulta exibida no detalhe.
 */
export const WHATSAPP_ACTIVITY_TYPES = ["whatsapp_inbound", "whatsapp_outbound"] as const;
