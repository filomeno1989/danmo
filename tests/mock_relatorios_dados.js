/**
 * Dados de mock para os testes do modulo Relatorios (usado por
 * tests/relatorios_exportacoes.js e scripts de diagnostico).
 *
 * 6 obras que cobrem todos os estados:
 *  1  Fechada, foi a CdM (ida 05/08, volta 09/08, fecho 12/08 por Chefe Mario)
 *  2  Na CdM agora
 *  3  De volta da CdM (nao fechada)
 *  4  Sem numero de obra, em circulacao
 *  5  Em circulacao com numero
 *  6  Fechada sem passar pela CdM
 */
module.exports = {
  ok: true,
  equipamentos: [
    { id: 1, code: "DM001", name: "Fretador 1", fleet_type: "Fretador CAT 777", active: true },
    { id: 2, code: "DM014", name: "Pa 2", fleet_type: "Pá CAT 320", active: true },
    { id: 3, code: "DM021", name: "Trator 3", fleet_type: "Trator CAT D8", active: true }
  ],
  ordens: [
    {
      id: 1, numero_obra: "70001", equipment_id: 1, data_abertura: "2025-08-02",
      status_atual: "Fechada", status_fisico: "Concluído", aberto_por: ["João"],
      descricao_avaria: "Reparacao do sistema de travoes", sector: "Extraccao"
    },
    {
      id: 2, numero_obra: "70002", equipment_id: 2, data_abertura: "2025-09-01",
      status_atual: "CdM", status_fisico: "Avariada", aberto_por: ["Maria"],
      descricao_avaria: "Motor com perda de potencia", sector: "Oficina"
    },
    {
      id: 3, numero_obra: "70003", equipment_id: 2, data_abertura: "2025-09-10",
      status_atual: "Supervisão", status_fisico: "Pneumático", aberto_por: ["Maria"],
      descricao_avaria: "Fuga hidraulica no braco", sector: "Moagem"
    },
    {
      id: 4, numero_obra: null, equipment_id: 3, data_abertura: "2025-10-01",
      status_atual: "Aberta (DTEC)", status_fisico: "Avariada", aberto_por: ["João"],
      descricao_avaria: "Sem marcha atras", sector: "Transporte"
    },
    {
      id: 5, numero_obra: "70005", equipment_id: 1, data_abertura: "2025-10-05",
      status_atual: "Chefe da Oficina", status_fisico: "Revisão/Manutenção", aberto_por: ["Ana"],
      descricao_avaria: "Troca de filtros", sector: "Extraccao"
    },
    {
      id: 6, numero_obra: "70006", equipment_id: 3, data_abertura: "2025-09-20",
      status_atual: "Fechada", status_fisico: "Concluído", aberto_por: ["Ana"],
      descricao_avaria: "Soldadura no chassis", sector: "Serralharia"
    }
  ],
  logs: [
    { id: 1, os_id: 1, status_anterior: "Chefe da Oficina", status_novo: "CdM", data_mudanca: "2025-08-05T09:00:00Z", responsavel: "Filomeno" },
    { id: 2, os_id: 1, status_anterior: "CdM", status_novo: "Supervisão", data_mudanca: "2025-08-09T10:00:00Z", responsavel: "CdM" },
    { id: 3, os_id: 1, status_anterior: "Supervisão", status_novo: "Fechada", data_mudanca: "2025-08-12T15:30:00Z", responsavel: "Chefe Mario" },
    { id: 4, os_id: 2, status_anterior: "Chefe da Oficina", status_novo: "CdM", data_mudanca: "2025-09-03T08:00:00Z", responsavel: "Filomeno" },
    { id: 5, os_id: 3, status_anterior: "Chefe da Oficina", status_novo: "CdM", data_mudanca: "2025-09-12T08:00:00Z", responsavel: "Filomeno" },
    { id: 6, os_id: 3, status_anterior: "CdM", status_novo: "Departamento Técnico", data_mudanca: "2025-09-15T14:00:00Z", responsavel: "CdM" }
  ]
};
