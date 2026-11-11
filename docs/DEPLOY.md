# Implantação e operação

## Estado e autorização

Projeto dedicado `textilflow-gui130699`. Firestore Standard em `southamerica-east1`, região confirmada pelo responsável. E-mail/senha habilitado no Authentication. O faturamento não foi ativado por esta implementação.

O App Hosting exige Blaze. Functions e o bucket de Storage também devem ser provisionados somente depois da autorização explícita para recursos faturáveis. Não executar o procedimento abaixo enquanto ela estiver pendente.

App Hosting não oferece região brasileira na documentação consultada. A região proposta para o frontend Next.js é `us-east4`; Firestore, Functions e o bucket regional permanecem em São Paulo. Confirmar a região do frontend antes de criar o backend. O navegador consulta os serviços Firebase diretamente; o servidor Next.js fornece a interface.

Referências oficiais: [regiões](https://firebase.google.com/docs/app-hosting/about-app-hosting#locations), [custos do App Hosting](https://firebase.google.com/docs/app-hosting/costs), [planos Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Preparação

1. Autorizar Blaze e vincular a conta de faturamento pelo [Console](https://console.firebase.google.com/project/textilflow-gui130699/overview?purchaseBillingPlan=metered). A conta de faturamento permanece sob controle do responsável.
2. Configurar orçamento no Google Cloud com alertas de 50%, 90% e 100% para um limite escolhido pelo responsável. Alertas não interrompem cobrança. Conferir leituras e armazenamento Firestore, Storage/transferência, Functions/Cloud Run, Cloud Build e Artifact Registry. As franquias gratuitas não garantem custo zero.
3. Verificar a execução Quality do commit que será publicado. Instalar Node 22 e executar `npm ci` e `npm --prefix functions ci`.
4. Conferir `apphosting.yaml`: contém apenas a configuração pública do SDK web e `NEXT_PUBLIC_USE_EMULATORS=false`. Não enviar `.env.local`, arquivos de credencial ou dados de emulador.
5. Criar o bucket padrão pelo Console Firebase Storage, escolhendo São Paulo e regras de produção. Não alterar sua localização depois. As regras versionadas substituem as regras iniciais no deploy.

## Publicação

```sh
npx firebase-tools deploy --only firestore,auth,functions,storage --project textilflow-gui130699
```

Conferir todos os índices até atingirem estado pronto. Para o App Hosting, preferir a conexão nativa com o repositório privado `gui130699/textilflow`, branch `main`, raiz `/`, backend `textilflow`, região `us-east4`. A instalação/autorização da integração GitHub deve ter acesso apenas ao repositório necessário. Não criar um segundo backend se já existir.

Alternativa de deploy da fonte local autorizada:

```sh
npx firebase-tools apphosting:backends:list --project textilflow-gui130699
npx firebase-tools apphosting:backends:create --backend textilflow --primary-region us-east4 --root-dir / --project textilflow-gui130699
npx firebase-tools deploy --only apphosting --project textilflow-gui130699
```

Para backend conectado ao GitHub, usar o rollout da conexão, não alternar inadvertidamente entre fontes:

```sh
npx firebase-tools apphosting:rollouts:create textilflow --git-branch main --project textilflow-gui130699
```

Copiar a URL retornada pelo serviço. Incluí-la nos domínios autorizados do Authentication. Configurar CORS do bucket para essa origem HTTPS usando `firebase/storage-cors.example.json` como modelo, substituindo a origem de exemplo antes de aplicar com `gcloud storage buckets update gs://textilflow-gui130699.firebasestorage.app --cors-file=ARQUIVO_LOCAL`. O exemplo não deve ser aplicado sem substituição. CORS não concede acesso: as Storage Rules continuam obrigatórias.

## Primeiro inspetor

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

## Monitoramento, limites e rollback

App Hosting: 0 instâncias mínimas, máximo 2. Cada Function: máximo 3 instâncias, 256 MiB, timeout 60 s. Esses limites reduzem escala automática, mas não constituem teto financeiro. Acompanhar erros, latência, quotas e alertas no Console Firebase/Google Cloud. Não registrar tokens, senhas ou arquivos privados em logs.

Para regressão de frontend, reverter o commit por Git e gerar novo rollout, ou restaurar rollout anterior no Console quando disponível. Functions: publicar o commit estável anterior depois de verificar compatibilidade dos contratos. Rules e índices são versionados; não restaurar regras permissivas. Histórico de produção não é apagado para rollback: usar estornos auditados. Backups/PITR de Firestore têm custo e precisam de decisão operacional antes de ativar.

O workflow GitHub Actions executa qualidade e testes em emuladores. A publicação contínua depende da conexão nativa App Hosting, ainda separada do workflow de testes.
