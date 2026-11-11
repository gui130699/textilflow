# TêxtilFlow

Gestão e acompanhamento de produção têxtil em português do Brasil. Next.js + Firebase Authentication, Firestore, Cloud Functions e Storage.

## Executar localmente

Requisitos: Node.js 22 LTS, npm, Java 21 (emuladores), Git. O desenvolvimento inicial também foi executado com Node 24; produção Functions está configurada para Node 22.

```sh
npm ci
npm --prefix functions ci
npm --prefix functions run build
node scripts/setup-emulator-env.mjs
npm run emulators
```

Em outro terminal:

```sh
npm run seed
npm run dev
```

Abra http://127.0.0.1:3000. O seed gera credenciais aleatórias exclusivamente locais em `.emulator-credentials.json`, ignorado pelo Git. Nunca use essas contas em produção. A aplicação não inclui botão para preencher credenciais nem cria dados fictícios automaticamente.

## Verificação

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
```

Integração e E2E precisam dos emuladores. E2E também precisa do seed. O Playwright inicia a aplicação quando necessário. Os testes usam transações, Authentication, Firestore Rules e Storage Rules reais dos emuladores.

## Produção

Projeto dedicado: `textilflow-gui130699`. Firestore Standard em São Paulo (`southamerica-east1`). GitHub: https://github.com/gui130699/textilflow, privado, branch `main`.

Consulte [DEPLOY](docs/DEPLOY.md) antes de publicar. O plano Blaze exige autorização explícita. As variáveis `NEXT_PUBLIC_FIREBASE_*` são configuração pública do SDK; credenciais administrativas nunca entram no frontend ou no Git.

## Documentação

- [Estado real da implementação e validação](docs/IMPLEMENTATION_STATUS.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Banco de dados](docs/DATABASE.md)
- [Segurança](docs/SECURITY.md)
- [Implantação e rollback](docs/DEPLOY.md)
- [Manual do usuário](docs/USER_GUIDE.md)
- [Histórico de mudanças](docs/CHANGELOG.md)
