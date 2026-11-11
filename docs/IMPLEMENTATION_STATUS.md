# Estado real da implementação

Registro inicial: 10/11/2026. Este documento distingue código executável, validação local e recursos publicados.

| Área          | Implementação e verificação                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend      | Next.js/React/TypeScript, navegação responsiva, tabelas, formulários, gráficos e PWA com estado offline sem cache de dados privados                                                                                            |
| Cadastros     | Empresas, clientes, terceiros, fornecedores, materiais, produtos, modelos, cores, tamanhos, grades, unidades, categorias, motivos de reprovação, tipos de inspeção e módulos; inclusão, edição, pesquisa, paginação e ativação |
| Projetos      | Metas, vínculos, etapas, prazos, status, linha do tempo, saldos por lote, histórico e anexos                                                                                                                                   |
| Operações     | Recebimentos, inspeções, modelagem, corte, envio/retorno de terceiros, embalagem, despacho, perdas, estorno e reconciliação                                                                                                    |
| Integridade   | Transações, idempotência por payload, bloqueio de saldo negativo, conservação de peças, variantes imutáveis, devoluções parciais e prazos FIFO                                                                                 |
| Segurança     | Backend verifica vínculos; Rules negam escrita operacional direta; proprietário somente leitura; convites de uso único e e-mail verificado; arquivos privados                                                                  |
| Relatórios    | Projetos, atrasos, cortes líquidos diários, saldos por terceiro/lote, histórico e inspeções, filtros, CSV e impressão                                                                                                          |
| Alertas       | Atrasos, inspeção e modelagem pendentes, produção parada, terceiros vencidos, divergências e conclusão                                                                                                                         |
| Firebase real | Projeto `textilflow-gui130699`, web app, Authentication e Firestore Standard em São Paulo criados. Regras e Authentication publicados e 174 índices conferidos. Sem dados fictícios em produção                                |
| GitHub        | Repositório privado `gui130699/textilflow`, branch principal `main`; código e workflow Quality publicados                                                                                                                      |
| Produção      | Functions, Storage e App Hosting ainda não publicados. Faturamento não ativado; não há URL de aplicação online verificada                                                                                                      |

## Validação

- Lint, TypeScript e build de produção aprovados.
- 22 testes unitários, 51 testes de integração no Firebase Emulator Suite e 18 testes de navegador passaram. Foram verificados o isolamento entre empresas, o acesso de leitura do proprietário, as transações concorrentes, os estornos, os relatórios e os anexos.
- Auditorias npm de frontend e Functions sem vulnerabilidades reportadas.
- Compilação das regras validada por dry-run. Firestore e Authentication publicados.
- O [workflow Quality](https://github.com/gui130699/textilflow/actions/runs/43024479740) passou no commit `8c48691`.

## Pendências externas para publicação

1. Autorização explícita do responsável e ativação do Blaze em conta de faturamento própria.
2. Confirmação de `us-east4` para App Hosting, que não oferece região brasileira na documentação consultada.
3. Provisionamento de Storage e Functions, integração GitHub/App Hosting, domínios Auth e CORS do bucket.
4. Primeiro inspetor com identidade administrativa autorizada; e-mail a confirmar.
5. Homologação online de login, escritas, relatórios, arquivos e isolamento entre empresas.

## Limites explícitos

- CSV e totais diários consideram as páginas carregadas; a interface informa quando existem mais páginas. Não são relatórios de estoque retroativo.
- Saldos por terceiro refletem o estado atual; filtro de período usa a última atualização do lote. Cortes diários são líquidos de estornos.
- Relatórios preservam cliente/produto registrados no momento do evento. Alterações posteriores de cadastro/projeto não reescrevem o livro-razão.
- PWA requer navegador compatível e HTTPS em produção; não permite operações offline.
- Alertas são internos. WhatsApp, e-mail automático e push ficam para versão futura, conforme o escopo solicitado.
- Rules e validações iniciais passaram nos cenários automatizados descritos; revisão de segurança antes de adoção ampla, App Check e política operacional de backups permanecem necessários.
- Autenticação e isolamento foram verificados localmente. Não declarar homologação online até existir deploy observado e testado.
