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
| GitHub        | Repositório público `gui130699/textilflow`, branch principal `main`; código e workflow Quality publicados                                                                                                                      |
| Produção      | Functions, Storage e App Hosting ainda não publicados. Faturamento não ativado; não há URL de aplicação online verificada                                                                                                      |

## Validação

- Lint, TypeScript e build de produção aprovados.
- 22 testes unitários, 51 testes de integração no Firebase Emulator Suite e 18 testes de navegador passaram. Foram verificados o isolamento entre empresas, o acesso de leitura do proprietário, as transações concorrentes, os estornos, os relatórios e os anexos.
- Auditorias npm de frontend e Functions sem vulnerabilidades reportadas.
- Compilação das regras validada por dry-run. Firestore e Authentication publicados.
- O [workflow Quality](https://github.com/gui130699/textilflow/actions/runs/43024479740) passou no commit `8c48691`.

## Piloto online sem Blaze

A configuração de [Render Free](PILOT.md) reutiliza o Firebase Auth e o Firestore Spark. A API Next.js verifica tokens Firebase e chama as mesmas operações de negócio das Cloud Functions. O piloto mantém cadastros, relatórios e movimentações. Anexos e imagens estão desativados nesse modo.

A [tela de login do piloto](https://textilflow-piloto.onrender.com/login) respondeu HTTP 200 no Render Free. A API rejeitou uma chamada sem sessão com HTTP 401. O domínio foi autorizado no Firebase Authentication. A conta de serviço dedicada foi preparada. A conexão autenticada com o Firebase ainda depende do Secret File no Render e da homologação no endereço público.

## Pendências para publicação pelo App Hosting

Na inspeção de migração, a `main` e o Render executavam a base `7f16ca2d02994b6254c77ee43c12af1fcf0380ca`. O [Quality dessa base](https://github.com/gui130699/textilflow/actions/runs/43419315067) passou. A consulta GitHub indicou que a branch não tinha proteção nem rulesets. A migração não muda essa configuração.

| Recurso        | Estado observado                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faturamento    | Spark. A API respondeu `billingEnabled: false` e não há conta vinculada para orçamento do projeto.                                                                                     |
| Firestore      | Banco `(default)` em `southamerica-east1`, regras iguais às versionadas e 174 índices `READY`, sem índices faltantes ou extras.                                                        |
| Authentication | E-mail/senha habilitado. Domínios `firebaseapp.com` e `web.app` do projeto e `textilflow-piloto.onrender.com` autorizados.                                                             |
| App Web        | App existente `1:180669335706:web:47ce6ba5adc9bac7987723`. As variáveis públicas em `apphosting.yaml` correspondem ao SDK, com emuladores desabilitados.                               |
| Storage        | Nenhum bucket retornado na listagem. O SDK indica o nome previsto `textilflow-gui130699.firebasestorage.app`. A existência e a região precisam ser verificadas após o provisionamento. |
| Functions v2   | API desativada. O código define `southamerica-east1`, 3 instâncias por função, 256 MiB e 60 s.                                                                                         |
| App Hosting    | API desativada e CLI bloqueada pelo Spark. `us-east4` é oferecida. Backend, rollout e URL ainda não confirmados.                                                                       |
| Render         | Login público respondeu HTTP 200. Conexão autenticada e disponibilidade como retorno funcional ainda não verificadas.                                                                  |

Next.js `16.4.6` permanece no lockfile. A documentação do App Hosting classifica versões superiores à faixa ativa como prévia. A validação real do adaptador depende do primeiro rollout. A preparação fixa `NEXT_PUBLIC_API_MODE=callable` no App Hosting e mantém `server` no Render.

Na cópia isolada, passaram lint, typecheck, 25 testes unitários, build das Functions, 54 testes de integração no `demo-textilflow`, 19 testes de navegador e o build do Next.js. Os dois cenários exclusivos do modo Render foram pulados no modo callable. O build local também passou com as variáveis públicas de `apphosting.yaml`. Os emuladores usaram Node `22.23.5` e Java `21.0.13`. A instalação com Node 22 emite avisos `EBADENGINE` em dependências do SDK Web. Esses avisos e a faixa de suporte do adaptador devem ser conferidos nos logs do primeiro build remoto.

Para prosseguir, o responsável precisa [ativar o Blaze no projeto](https://console.firebase.google.com/project/textilflow-gui130699/overview?purchaseBillingPlan=metered). Depois, conferir novamente os recursos, publicar Storage e Functions, conectar o GitHub e fazer o rollout pelo SHA validado. A homologação autenticada requer contas de teste autorizadas e uma empresa de homologação aprovada. O [runbook de implantação](DEPLOY.md) descreve o tratamento dos convites antigos e o retorno ao Render.

## Limites explícitos

- CSV e totais diários consideram as páginas carregadas; a interface informa quando existem mais páginas. Não são relatórios de estoque retroativo.
- Saldos por terceiro refletem o estado atual; filtro de período usa a última atualização do lote. Cortes diários são líquidos de estornos.
- Relatórios preservam cliente/produto registrados no momento do evento. Alterações posteriores de cadastro/projeto não reescrevem o livro-razão.
- PWA requer navegador compatível e HTTPS em produção; não permite operações offline.
- Alertas são internos. WhatsApp, e-mail automático e push ficam para versão futura, conforme o escopo solicitado.
- Rules e validações iniciais passaram nos cenários automatizados descritos; revisão de segurança antes de adoção ampla, App Check e política operacional de backups permanecem necessários.
- Autenticação e isolamento foram verificados localmente. Não declarar homologação online até existir deploy observado e testado.
