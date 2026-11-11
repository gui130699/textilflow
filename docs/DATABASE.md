# Firestore Standard

Banco `(default)`, região `southamerica-east1`, modo nativo, projeto `textilflow-gui130699`.

| Caminho                                      | Finalidade                                            |
| -------------------------------------------- | ----------------------------------------------------- |
| `users/{uid}`                                | Perfil privado sem permissões editáveis pelo usuário  |
| `users/{uid}/companies/{companyId}`          | Descoberta de vínculos, escrita exclusiva do servidor |
| `companies/{companyId}`                      | Dados cadastrais e situação da empresa                |
| `companies/{companyId}/members/{uid}`        | Perfil inspector/owner e vínculo ativo                |
| `companies/{companyId}/{catalog}/{id}`       | Cadastros comerciais e auxiliares                     |
| `companies/{companyId}/projects/{projectId}` | Projeto, meta, resumo físico e indicadores            |
| `.../materialReceipts/{operationId}`         | Entrada de matéria-prima e resumo inspecionado        |
| `.../inspections/{operationId}`              | Evento imutável de inspeção                           |
| `.../modeling/{operationId}`                 | Histórico de liberação/bloqueio                       |
| `.../productionMovements/{operationId}`      | Livro-razão imutável                                  |
| `.../productionBalances/{lotId}`             | Saldo físico por conta, lote, cor e tamanho           |
| `.../reversals/{originalOperationId}`        | Marcador único de compensação                         |
| `.../attachments/{attachmentId}`             | Metadados e visibilidade do anexo                     |
| `.../activityLog/{id}`                       | Ação, ator, data e dados de auditoria                 |
| `invites/{sha256}`                           | Convite privado, e-mail, validade, perfil, consumo    |

Catálogos: clients, thirdParties, suppliers, materials, products, models, colors, sizes, grades, units, categories, rejectionReasons, inspectionTypes, modules.

Contas de peças: corte, estamparia:{terceiro}, estampa-pronta, costura:{terceiro}, costura-pronta, embalagem, embalado, quarentena, perdas, despachado.

## Integridade

Movimentos guardam operationId, companyId, projectId, lotId, unit, quantity, source, destination, deltas, cutDelta, hash, createdBy, occurredOn e recordedAt. `occurredOn` é a data operacional declarada; `recordedAt` é timestamp do servidor. Alterações e convites usam timestamps do servidor. Datas civis seguem ISO (YYYY-MM-DD), formatadas DD/MM/AAAA na interface, com calendário America/Sao_Paulo.

Cada transação lê vínculo, empresa, projeto, lote e ID de movimento; o Firestore repete a transação em conflito. Repetir o mesmo ID e payload retorna o resultado existente. Reutilizar ID com outro payload é rejeitado. Estornos aplicam os deltas inversos sem alterar o livro-razão original.

Resumos do projeto e lote são atualizados juntos. Reconciliação refaz os saldos pelo histórico e registra divergências; não modifica silenciosamente saldos incorretos. Reparos administrativos exigem investigação e evento compensatório apropriado.

`firestore.indexes.json` contém índices para pesquisa, paginação e combinações de filtros. Nenhum índice altera regras de autorização.
