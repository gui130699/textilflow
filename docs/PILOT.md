# Piloto online sem Blaze

O Render executa o Next.js e a API. O login e o Firestore continuam no projeto `textilflow-gui130699` no Firebase Spark. A API verifica a sessão Firebase e chama as mesmas operações testadas das Cloud Functions. Os anexos, logos e imagens de modelos ficam desativados no piloto.

## Implantação

1. Entre no Render e abra [Implantar o TêxtilFlow](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fgui130699%2Ftextilflow). O arquivo `render.yaml` configura um único Web Service gratuito. Confirme que o plano selecionado é **Free**.
2. Prepare uma conta de serviço dedicada no projeto Firebase com **Cloud Datastore User** e um papel de autenticação limitado a `firebaseauth.users.get` e `firebaseauth.users.update`. Ela permite executar operações Firestore, verificar a sessão e atualizar perfis. Use uma identidade administrativa separada para provisionar o primeiro inspetor.
3. No serviço do Render, adicione um **Secret File** chamado `firebase-admin.json` com a credencial da conta de serviço. O SDK procura o arquivo em `/etc/secrets/firebase-admin.json`. Mantenha a credencial fora do Git, do frontend, dos logs e das mensagens.
4. Publique o serviço, aguarde o estado **Live** e confira o endereço emitido pelo Render. Em Authentication, acrescente o domínio publicado à lista de domínios autorizados.
5. Provisione o primeiro inspetor com o procedimento de [implantação](DEPLOY.md#primeiro-inspetor). Verifique login, uma operação real com a empresa do inspetor e as restrições de acesso antes de liberar o piloto para a equipe.

O plano gratuito pausa a instância após inatividade e aplica franquias de uso. O primeiro acesso após a pausa pode demorar. Consulte os [limites do Render Free](https://render.com/docs/free) e as [franquias do Firebase Spark](https://firebase.google.com/pricing/).

## Teste local

Use os emuladores Auth e Firestore do projeto `demo-textilflow`. Com o seed pronto, inicie o Next.js com `NEXT_PUBLIC_API_MODE=server`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` e `GCLOUD_PROJECT=demo-textilflow`. O cliente continua com `NEXT_PUBLIC_USE_EMULATORS=true`. Execute `npm run test:e2e` com o mesmo modo.
