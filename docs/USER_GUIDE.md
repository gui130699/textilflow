# Manual básico

## Cadastro de inspetor

Na tela de login, abra **Criar conta → Cadastrar como inspetor** e confirme seu e-mail. Em **Cadastrar empresa**, informe o CNPJ. Se ele já existir, o app cria um pedido de acesso e a empresa só aparece para você após a aprovação. O primeiro inspetor analisa os pedidos em **Usuários e permissões**. A aprovação é registrada no histórico da empresa.

Cada lote operacional novo recebe como responsável o inspetor que registra o primeiro corte. Em **Projetos → Visão geral → Lotes operacionais**, um inspetor pode transferir a responsabilidade para outro inspetor ativo da mesma empresa. Lotes antigos sem responsável aparecem como **A definir** até que sejam atribuídos.

Em **Cadastros → Empresas → Cadastrar nova empresa**, informe o CNPJ e clique em **Consultar CNPJ**. O formulário usa a consulta pública da CNPJ.ws e, se necessário, a Minha Receita. Revise os dados preenchidos e complete os campos em branco, como WhatsApp e responsável. Se a consulta falhar, você pode preencher os dados manualmente.

## Primeiro acesso

O operador provisiona o primeiro inspetor usando `scripts/bootstrap-admin.ts`. Na tela de login, use **Esqueci minha senha** para definir a senha da conta. O script não imprime nem armazena senhas.

## Empresa e cadastros

1. Entre e selecione **Cadastrar empresa**.
2. Preencha razão social, nome, documento, contato e endereço.
3. Selecione a empresa criada.
4. Em **Cadastros**, crie cliente comercial, fornecedores, terceiros, materiais, produtos e modelos.
5. Use a pesquisa para localizar registros. Abra o nome para editar ou visualizar. Desmarque **Registro ativo** para inativar, preservando o histórico.

Cliente comercial e terceiro são cadastros operacionais, não contas de login.

## Convidar proprietário

Em **Usuários e acessos**, informe o e-mail, escolha `owner` e gere o convite. Compartilhe o link com esse destinatário. Ele cria a conta, confirma o e-mail e aceita o convite. `inspector` concede acesso operacional e gerenciamento de vínculos; use somente para inspetores autorizados. O convite expira em 48 horas.

## Primeiro projeto

Em **Projetos → Novo projeto**, escolha cliente, produto, modelo, meta e datas. Vincule materiais, fornecedores e terceiros. Selecione as etapas e os módulos necessários. Use Ctrl/Cmd para selecionar várias opções nas listas múltiplas. O nome do projeto é sua identificação principal.

## Acompanhar a produção

- **Recebimentos:** informe material, fornecedor, quantidade e unidade. Abra **Inspecionar** na linha do recebimento para preencher seu identificador automaticamente.
- **Inspeções:** aprovado + reprovado deve coincidir com o inspecionado. Reprovação exige motivo. Não misture unidades.
- **Modelagem:** registre a liberação antes de cortar.
- **Produção → Registrar corte:** escolha lote e quantidade. A entrada cria peças disponíveis em corte.
- **Enviar a terceiro:** escolha parceiro, estamparia/costura e previsão. Somente peças disponíveis podem sair.
- **Receber de terceiro:** registre retorno parcial e defeitos. Defeitos permanecem em quarentena.
- **Transferir / embalar:** mova costura-pronta para embalagem, depois embalagem para embalado.
- **Registrar despacho:** informe quantidade, destinatário e documento opcional.
- **Estornar:** use a ação na linha do movimento. Informe motivo. Se as peças já foram consumidas, desfaça primeiro os movimentos posteriores pertinentes.
- **Conferir saldos com histórico:** executa reconciliação. Investigue divergências antes de continuar a operação.

A soma de todos os saldos, incluindo despachados e perdas, é igual ao corte líquido. Quantidade cortada é acumulada; não some novamente esse indicador aos saldos físicos.

## Fotos e relatórios

Envie JPG, PNG ou PDF de até 10 MB em **Fotos e anexos**. Escolha se o proprietário pode visualizar. Em **Relatórios**, aplique filtros, carregue as páginas necessárias e exporte CSV ou imprima. A exportação contém os registros carregados, não registros de outras páginas ainda não consultadas.

## Encerramento

Edite o projeto para concluir. Um projeto com saldo em andamento ou meta não despachada exige justificativa de encerramento excepcional. Ajuste de meta também exige motivo. O proprietário consulta os resultados, sem botões operacionais de escrita.
