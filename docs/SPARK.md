# Implantação gratuita no Firebase Hosting

O build Spark usa Next.js estático, Firebase Authentication e o Firestore existente de São Paulo, no projeto `textilflow-gui130699`. O GitHub versiona o código e roda o Quality. O build Spark não usa SSR, API Routes, Render, Cloud Functions ou Storage.

## Build e verificações

- Node 22 e Java 21. Instale com `npm ci` e `npm --prefix functions ci`. O segundo instala o código legado para o Quality.
- Rode `npm run lint`, `npm run typecheck`, `npm test` e `npm --prefix functions run build`.
- `npm run build:spark -- --emulator` gera `out/` para testes. Use `demo-textilflow` para seed e testes. `NEXT_PUBLIC_API_MODE=firestore` faz o Playwright servir a saída estática; não substitua essa saída enquanto o navegador estiver testando.
- `npm run build:spark` gera o artefato de publicação com o app Web existente e emuladores desligados. Não publique o artefato do emulador.
- Projetos novos usam `/projetos/detalhe?id=<ID>`. Os IDs não precisam existir no build. Em Produção → OFs e projetos, as OFs e os projetos legados continuam acessíveis pelo mesmo detalhe.
- Confira o commit e o Quality antes da promoção oficial.

## Operações e limites

| Área                   | Transporte e condição                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfil e vínculos      | Login Auth; cadastro de inspetor exige e-mail verificado. O documento do CNPJ e os vínculos iniciais são atômicos. Empresa existente exige decisão do primeiro inspetor.                                                                                                                                                                                                               |
| Convites               | Documento por hash, prazo de 48 horas calculado com tempo do servidor e transação de uso único por e-mail verificado. Spark convida proprietários; inspetores pedem acesso pelo CNPJ.                                                                                                                                                                                                  |
| Cadastros e projetos   | SDK Web; escritas limitadas a inspetores ativos. Regras verificam chaves, vínculos principais e impedem alteração de saldos pelo formulário.                                                                                                                                                                                                                                           |
| Recebimento e inspeção | Unidades em milésimos, sem ultrapassar o recebido; inspeção e atualização do recebimento na mesma transação. Modelagem atualiza o projeto junto do evento.                                                                                                                                                                                                                             |
| Produção               | SDK Web transacional. As regras derivam as contas e deltas da operação, exigem lançamento imutável, saldo do lote e totais do projeto na mesma transação. Estorno usa registro exclusivo. Retorno de terceiros consome o envio mais antigo: quando abranger vários envios, registre um retorno por envio. Perda em terceiro deve ser registrada após o retorno para uma conta interna. |
| Histórico              | Histórico operacional legado permanece; novos lançamentos são imutáveis. A conferência de saldos da versão Spark é só leitura. O detalhe permite consultar alterações do projeto e atribuições de lotes, além do histórico legado.                                                                                                                                                     |
| CNPJ e arquivos        | Consultas públicas via CNPJ.ws e Minha Receita, sem credenciais. Se falharem, preencha manualmente. Fotos, logos e PDFs ficam fora da interface Spark; referências existentes são preservadas.                                                                                                                                                                                         |
| Relatórios             | Filtros e paginação por empresa. O CSV exporta as páginas carregadas.                                                                                                                                                                                                                                                                                                                  |

As regras impõem tipo, escopo, papéis, integridade numérica e alterações atômicas. O campo `nextDueOn` é um resumo de alerta calculado pelo cliente; a regra valida o formato e a mutação FIFO dos envios, mas não recalcula o menor prazo de todas as filas. As listas de vínculo do formulário do projeto são validadas pelo cliente; o Firestore valida seus IDs e os vínculos principais, e cada operação que movimenta um terceiro, material ou fornecedor valida a referência ativa na própria empresa. Revise esses limites antes de ampliar a homologação.

## Pedidos e ordens de fabricação

Cada item tem uma grade de até 12 combinações de cor × tamanho. As folhas por cor são independentes das peças. As regras verificam a reserva em cada combinação ao gravar a OF e o item na mesma transação. O cancelamento devolve as peças ao saldo a programar apenas se a OF continuar em planejamento e sem histórico operacional. A sequência de setores fica gravada na OF. As operações continuam seguindo as etapas e regras de estoque existentes.

As listas de materiais, cores e fornecedores são verificadas na transação do SDK. As regras do Firestore validam o formato e os vínculos principais na empresa. Os projetos legados continuam no mesmo lugar e mantêm os saldos e históricos.

## Homologação isolada

- Localmente, gere o build com `npm run build:spark -- --emulator` e rode `npm run emulators -- emulators:exec --only auth,firestore,functions,storage "npm run test:integration && npm run seed && npm run test:e2e"` com `NEXT_PUBLIC_API_MODE=firestore`. Os emuladores de Functions e Storage cobrem o legado na suíte de integração. O aplicativo estático usa apenas Auth e Firestore.
- Online, use [textilflow-hml-gui130699.web.app](https://textilflow-hml-gui130699.web.app). Gere o build com `npm run build:spark -- --homologacao` e publique com `npx firebase deploy --only firestore:rules,hosting --project textilflow-hml-gui130699`. Em uma instalação nova de homologação, publique também os índices com `--only firestore:indexes`.
- Com acesso administrativo à homologação, `npx tsx scripts/seed-homologacao.ts textilflow-hml-gui130699` provisiona e verifica a massa de teste. As credenciais ficam em `~/.codex/textilflow-homologacao/credenciais.json` na máquina que realizou o provisionamento. A demonstração local usa `.emulator-credentials.json`.
- Entre em Confecção Modelo — Demonstração → Pedidos → PED-1042 → OF-0087. O inspetor pode testar a operação. O proprietário pode consultar os registros.

## Publicação oficial e retorno

Depois de validar a homologação e o Quality, gere `npm run build:spark` e publique com `npx firebase deploy --only firestore:rules,hosting --project textilflow-gui130699`. Se apenas a interface mudou, use `--only hosting`. Confira a URL oficial e preserve contas e registros do projeto. Execute o seed apenas na homologação ou no emulador.

Para voltar, restaure a versão anterior em Firebase → Hosting → Histórico de versões. As alterações de pedidos e OFs preservam a estrutura dos projetos legados. Mantenha as regras novas se ainda houver OFs e pedidos em uso por clientes com a versão atual. A reversão do Hosting preserva o Firestore. O plano permanece Spark.
