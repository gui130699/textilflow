# Modelo de segurança

Estas regras constituem uma implementação inicial a ser revisada antes de compartilhar o sistema amplamente. Os testes automatizados verificam os cenários descritos abaixo; não substituem revisão de segurança independente.

## Permissões

O claim administrativo `inspector` somente permite criar empresas. Acesso aos dados exige vínculo ativo específico na empresa. O servidor verifica empresa ativa e membership em cada transação. Proprietário tem apenas leitura. O usuário não pode escrever seu próprio role, membership, claim, saldo ou histórico pelo SDK.

O provisionamento do primeiro inspetor usa Admin SDK com credencial local de operador, fora do navegador. Convites têm token aleatório de 256 bits, hash SHA-256 no banco, validade de 48 horas, e-mail verificado e consumo único. O criador precisa continuar autorizado quando o convite é aceito. Não há cadastro público que conceda acesso a empresas.

Regras Firestore negam todas as escritas do cliente. Validações de create/update residem nos contratos Zod das Functions. Não existe regra de update que aceite campos arbitrários. Perfil privado só pode ser lido pelo próprio usuário. Solicitações de relatórios têm companyId autorizado e cursor restrito à mesma empresa.

## Anexos

Storage admite criação por inspetores em projetos existentes, até 10 MB, JPG/PNG/PDF. Sobrescrita e exclusão são bloqueadas. A Function confere tamanho e assinatura dos bytes antes de registrar o documento. Proprietários só leem anexos marcados ownerVisible. Downloads usam o SDK autenticado; não se geram URLs com tokens permanentes. Configurar CORS do bucket para o domínio publicado é parte do deploy.

## Ataques cobertos

- Leitura/listagem anônima; empresa alheia; vínculo revogado; subcoleção órfã.
- Autopromoção de role/claim; alteração de membros; leitura de perfil privado alheio.
- Escrita direta de projeto, saldo ou livro-razão; exclusão de histórico.
- Dados arbitrários, quantidades inválidas, caminhos manipulados e parâmetros desconhecidos.
- Retorno excessivo, saldo negativo, salto de etapas, corte acima da meta.
- Clique duplicado, payload diferente com mesmo ID, saídas concorrentes, estorno duplicado.
- Anexo privado, tipo proibido, upload excessivo, arquivo de outra empresa.
- Convite de outro e-mail e reutilização de convite.

## Operação

Não registrar senhas, ID tokens ou contas de serviço em logs. Variáveis públicas Firebase não são credenciais administrativas. Manter dependências atualizadas e conferir `npm audit` para frontend e Functions. Rotas exigem sessão na interface; o limite de segurança real está nas Rules e Functions. PWA não armazena dados operacionais para uso offline.

Antes do lançamento amplo, configurar App Check, políticas de senha, prevenção de enumeração de e-mails, limites de consumo e monitoramento. A disponibilidade de quotas gratuitas não garante ausência de cobrança no Blaze.
