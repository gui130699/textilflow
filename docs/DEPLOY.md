# Implantação e operação

## Estado e autorização

Projeto dedicado `textilflow-gui130699`. Firestore Standard em `southamerica-east1`, região confirmada pelo responsável. E-mail/senha habilitado no Authentication. O faturamento não foi ativado por esta implementação.

O App Hosting exige Blaze. A leitura da API de faturamento confirmou que o projeto ainda está no Spark, sem conta de faturamento vinculada. Para liberar o provisionamento, abra o [Console Firebase](https://console.firebase.google.com/project/textilflow-gui130699/overview?purchaseBillingPlan=metered), selecione **Blaze** e vincule uma conta de faturamento. A ativação cabe ao responsável pelo projeto.

A região prevista para o frontend Next.js é `us-east4`, listada na documentação do App Hosting. Firestore permanece em São Paulo. Functions e o bucket padrão, se ainda não existir, devem usar `southamerica-east1`. O navegador consulta os serviços Firebase diretamente e o servidor Next.js fornece a interface.

Referências oficiais: [regiões](https://firebase.google.com/docs/app-hosting/about-app-hosting#locations), [custos do App Hosting](https://firebase.google.com/docs/app-hosting/costs), [planos Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Preparação

1. Autorizar Blaze e vincular a conta de faturamento pelo [Console](https://console.firebase.google.com/project/textilflow-gui130699/overview?purchaseBillingPlan=metered). A conta de faturamento permanece sob controle do responsável.
2. Configurar orçamento no Google Cloud com alertas de 50%, 90% e 100% para um limite escolhido pelo responsável. Alertas não interrompem cobrança. Conferir leituras e armazenamento Firestore, Storage/transferência, Functions/Cloud Run, Cloud Build e Artifact Registry. As franquias gratuitas não garantem custo zero.
3. Verificar a execução Quality do commit que será publicado. Instalar Node 22 e executar `npm ci` e `npm --prefix functions ci`.
4. Conferir `apphosting.yaml` e as variáveis do backend. Usar a configuração pública do app Web existente, `NEXT_PUBLIC_USE_EMULATORS=false` e o modo callable, sem `NEXT_PUBLIC_API_MODE=server`. Usar as identidades gerenciadas do Google para Functions e App Hosting.
5. Reutilizar o bucket padrão quando presente. Se ainda não existir, criá-lo pelo Console Firebase Storage em São Paulo. Conferir o nome real no SDK e no Admin SDK antes de publicar. Preservar os recursos, usuários e configurações do mesmo projeto.

## Publicação

```sh
npx firebase-tools deploy --only functions,storage --project textilflow-gui130699
```

As regras do Firestore em produção correspondem ao arquivo versionado e os 174 índices estão prontos na inspeção anterior ao Blaze. Revalidar antes de publicar e aplicar somente diferenças necessárias. Preservar o Authentication e acrescentar o novo domínio à lista existente.

Listar os backends com `firebase apphosting:backends:list --project textilflow-gui130699` após o Blaze. Reutilizar `textilflow` se existir. Em **Firebase → App Hosting**, conectar apenas `gui130699/textilflow`, branch `main`, raiz `/`, região `us-east4`. Manter publicações automáticas desativadas durante a homologação. Implantar Functions e solicitar o rollout do mesmo SHA validado:

```sh
npx firebase-tools apphosting:rollouts:create textilflow --git-commit SHA_COMPLETO_VALIDADO --project textilflow-gui130699
```

Registrar a URL HTTPS, o ID do rollout e o SHA somente depois de observá-los. Acrescentar o domínio ao Authentication sem remover o Render. Para CORS, ler a configuração atual do bucket, acrescentar a origem HTTPS observada e preservar as origens legítimas antes de aplicar o arquivo completo. Usar `firebase/storage-cors.example.json` como referência para GET e HEAD. Confirmar download autenticado e permissão de proprietário com arquivos de homologação.

## Primeiro inspetor

O fluxo normal é **Criar conta → Cadastrar como inspetor**, com confirmação de e-mail. Contas existentes podem continuar com os mesmos UIDs. O bootstrap abaixo é reservado ao provisionamento administrativo autorizado.

O script de bootstrap requer uma identidade administrativa local autorizada no projeto. Preferir Application Default Credentials de operador, sem baixar chaves de conta de serviço.

```sh
gcloud auth application-default login
npx tsx scripts/bootstrap-admin.ts EMAIL_DO_RESPONSAVEL textilflow-gui130699
```

O script cria ou encontra o usuário e atribui o claim `inspector`. Não imprime nem gera senha. Na URL publicada, usar **Esqueci minha senha** para definir a senha pelo e-mail. Nenhum proprietário recebe esse claim. O operador não deve executar esse script com e-mails de terceiros sem autorização.

Após login: cadastrar a primeira empresa, selecioná-la, cadastrar cliente/produto/modelo e demais vínculos, criar projeto. Em **Usuários e acessos**, gerar convite para o proprietário, compartilhar o link pelo canal escolhido pelo responsável e solicitar confirmação do e-mail. O sistema não envia convites por conta própria.

## Verificação online obrigatória

- Login, recuperação de senha e escolha da empresa.
- Salvar e consultar cadastros e projeto; liberar modelagem e registrar uma operação autorizada.
- Conferir transação, relatório, auditoria e reconciliação.
- Upload e download autenticado de imagem/PDF; acesso ao anexo respeita a visibilidade.
- Conta proprietária consulta sem escrever. Conta sem vínculo não lê dados da empresa.
- Conferir logs e ausência de conexões com emuladores no navegador.

Não usar o seed de demonstração em produção. Para a homologação, usar empresa de homologação expressamente aprovada e identificada. Registrar URL, commit e resultado em `IMPLEMENTATION_STATUS.md` somente após observar o resultado real.

## Convites e troca de endereço

Os convites expiram 48 horas depois da emissão e carregam o token no fragmento da URL. A tela aceita colar links da sua própria origem. Durante a homologação, emitir convites novos no endereço em que serão usados e testar a aceitação pelo e-mail autorizado. Manter o endereço do Render disponível por pelo menos 48 horas após a última emissão antiga, se sua API estiver operacional. Se o Render não puder aceitar um convite ainda válido, reemitir pelo novo endereço após a homologação e orientar o destinatário a usar o link novo. Não registrar tokens nem copiar fragmentos para parâmetros de consulta.

## Monitoramento, limites e rollback

App Hosting: 0 instâncias mínimas, máximo 2. Cada Function: máximo 3 instâncias, 256 MiB, timeout 60 s. Esses limites reduzem escala automática, mas não constituem teto financeiro. Acompanhar erros, latência, quotas e alertas no Console Firebase/Google Cloud. Não registrar tokens, senhas ou arquivos privados em logs.

Para regressão de frontend, reverter o commit por Git e gerar novo rollout, ou restaurar rollout anterior no Console quando disponível. Functions: publicar o commit estável anterior depois de verificar compatibilidade dos contratos. Rules e índices são versionados; não restaurar regras permissivas. Histórico de produção não é apagado para rollback: usar estornos auditados. Backups/PITR de Firestore têm custo e precisam de decisão operacional antes de ativar.

Durante a primeira publicação, o retorno é apontar os usuários de volta para `https://textilflow-piloto.onrender.com`, desde que a conexão autenticada do piloto esteja operacional. A tela pública do Render respondeu HTTP 200, mas o fluxo autenticado do piloto precisa ser confirmado antes de contarmos com ele como retorno funcional. Preservar configuração e credenciais do Render. Trocar o endereço principal e só então considerar a pausa reversível do Render, após homologação autenticada e tratamento dos convites antigos.

O workflow GitHub Actions executa qualidade e testes em emuladores. A publicação contínua depende da conexão nativa App Hosting, ainda separada do workflow de testes.
