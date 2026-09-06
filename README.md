# Sistema de Controlo de Ponto por QR Code

Controlo de entradas e saídas por leitura de QR Code, com **PostgreSQL** como base de
dados e **login simplificado** por email e palavra-passe.

O utilizador de dispositivo móvel abre o leitor e aponta a câmara ao cartão da pessoa —
o sistema decide sozinho se é entrada ou saída. O administrador não lê cartões: acompanha
os relatórios de entradas e saídas das pessoas registadas, organizadas por categorias
(**Funcionários**, **Professores**, **Estudantes**, **Visitantes** e outras que crie).

## Arquitectura

Uma aplicação no browser não se liga directamente ao PostgreSQL — as credenciais da base
de dados ficariam expostas a quem abrisse o código da página. Por isso o sistema tem duas
partes:

```
src/       App Ionic + Angular (browser, Android, iOS)
             │  HTTPS + token JWT
             ▼
server/    API Node.js + Express
             │  ligação directa (pg)
             ▼
           PostgreSQL
```

### Perfis de utilizador

| Perfil | Para quem | O que pode fazer |
| --- | --- | --- |
| **Administrador** | responsável do sistema | tudo: pessoas, contas, categorias, horários e relatórios |
| **Gestor** | direcção, recursos humanos | consulta registos e relatórios, sem alterar dados |
| **Operador** | posto de entrada, telemóvel | apenas o leitor de QR Code |

Cada perfil entra directamente no ecrã que lhe interessa: o operador no leitor, os
restantes no painel. O menu lateral mostra apenas o que o perfil pode abrir, e a API
volta a validar as permissões em cada pedido — esconder um botão não é segurança.

### Modelo de dados

| Tabela | Conteúdo |
| --- | --- |
| `users` | contas de acesso ao sistema (login) |
| `categories` | tipos de pessoas registadas, com prefixo de código |
| `members` | pessoas cujo ponto é controlado, com código interno e token do QR Code |
| `attendance` | um registo por pessoa por dia, com entrada, saída, atraso e estado |
| `work_schedules` | horário geral e horários próprios por categoria |
| `scan_log` | histórico de leituras, incluindo as recusadas (auditoria) |

O QR Code **não contém dados pessoais** — guarda apenas um token aleatório
(`AEM-<32 hex>`). Um cartão perdido não revela nada e pode ser revogado individualmente
sem afectar os restantes.

## Instalação

Precisa de **Node.js 18+** e de um **PostgreSQL 14+**.

### 1. Base de dados

Com Docker:

```bash
docker compose up -d
```

Ou, num PostgreSQL já instalado:

```sql
CREATE DATABASE controle_ponto;
CREATE USER ponto WITH PASSWORD 'ponto';
GRANT ALL PRIVILEGES ON DATABASE controle_ponto TO ponto;
```

### 2. API

```bash
cd server
npm install
cp .env.example .env      # ajuste DATABASE_URL e JWT_SECRET
npm run migrate           # cria as tabelas e as categorias iniciais
npm run seed              # cria a conta de administrador
npm start                 # http://localhost:3000
```

O `seed` usa `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`
(por omissão `admin@aem.local` / `admin123`). **Altere a palavra-passe no primeiro
acesso**, em *Configurações → Alterar palavra-passe*.

### 3. Aplicação

Noutro terminal, a partir da raiz do projecto:

```bash
npm install
npm start                 # http://localhost:4200
```

`src/environments/environment.ts` aponta para `http://localhost:3000/api` em
desenvolvimento; `environment.prod.ts` usa `/api`, para quando a API e a app são servidas
no mesmo domínio.

## Utilização

1. **Entre como administrador** e crie as pessoas em *Pessoas registadas*. O código
   interno (`FUN0001`, `PRO0001`, `EST0001`...) e o QR Code são gerados automaticamente.
2. **Imprima os cartões** — no cartão de cada pessoa, *Imprimir cartão* abre uma folha
   pronta a imprimir com o QR Code, o nome e o código.
3. **Crie uma conta de operador** em *Contas de acesso* para quem vai ficar no posto de
   entrada com o telemóvel.
4. **No telemóvel**, o operador entra com essa conta e fica no leitor. Cada leitura mostra
   o nome da pessoa e se foi registada entrada ou saída, com vibração de confirmação.
5. **Acompanhe** no painel (números do dia) e em *Relatórios* (presenças, faltas, atrasos
   e horas por pessoa, exportáveis em CSV).

### Como o sistema decide entrada ou saída

Na primeira leitura do dia regista **entrada** e compara a hora com o horário da categoria
para marcar atraso. Na leitura seguinte regista **saída**. Uma terceira leitura no mesmo
dia é recusada com uma mensagem clara.

Duas leituras do mesmo cartão em menos de dois minutos contam como o mesmo gesto — evita
que um cartão deixado à frente da câmara registe entrada e saída seguidas.

### Horários e tolerância

O horário geral aplica-se a todas as categorias. Uma categoria pode ter horário próprio —
útil quando os estudantes entram a uma hora diferente do pessoal. A tolerância evita
marcar atraso por poucos minutos: com entrada às 08:00 e 10 minutos de tolerância, quem
chega às 08:09 não fica atrasado.

### Correcções manuais

Falhas de leitura, esquecimentos e ausências justificadas corrigem-se em
*Registos de ponto → botão +*, que grava o registo do dia dessa pessoa e fica marcado
como lançamento manual.

### Cartão perdido

Em *Pessoas registadas → QR Code → Emitir novo QR Code*: o token anterior deixa de
funcionar de imediato e imprime-se o cartão novo.

## Aplicação móvel (Capacitor)

```bash
npm run build
npx cap add android        # ou: npx cap add ios
npx cap sync
npx cap open android
```

A leitura usa a câmara do dispositivo através do WebView. Em **Android**, declare a
permissão em `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

Em **iOS**, acrescente a `ios/App/App/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>A câmara é usada para ler o QR Code de registo de ponto.</string>
```

No browser, a câmara só é autorizada em `localhost` ou sobre HTTPS. Sem câmara
disponível, o leitor mostra a introdução manual do código — o posto continua a funcionar.

## Testes

```bash
cd server && npm test     # testes da API (precisam do PostgreSQL a correr)
npm run lint              # na raiz, análise estática da app
```

Os testes da API cobrem o login, as permissões de cada perfil, o ciclo entrada/saída,
os duplicados, os relatórios e a revogação de QR Codes. Sem PostgreSQL acessível são
ignorados em vez de falharem.

## API

Todas as rotas, excepto `POST /api/auth/login` e `GET /api/health`, exigem o cabeçalho
`Authorization: Bearer <token>`.

| Método | Rota | Perfis |
| --- | --- | --- |
| `POST` | `/api/auth/login` | público |
| `GET` | `/api/auth/me` | autenticado |
| `POST` | `/api/auth/change-password` | autenticado |
| `POST` | `/api/attendance/scan` | autenticado |
| `GET` | `/api/attendance`, `/api/attendance/today` | autenticado |
| `POST` | `/api/attendance/manual` | admin |
| `GET` | `/api/attendance/scan-log` | admin, gestor |
| `GET` | `/api/members`, `/api/members/:id/qrcode` | autenticado |
| `POST` `PATCH` `DELETE` | `/api/members` | admin |
| `POST` | `/api/members/:id/regenerate-qr` | admin |
| `GET` | `/api/categories`, `/api/schedules` | autenticado |
| `POST` `PATCH` `DELETE` `PUT` | `/api/categories`, `/api/schedules` | admin |
| `GET` | `/api/reports/dashboard`, `/summary`, `/export` | admin, gestor |
| `GET` `POST` `PATCH` `DELETE` | `/api/users` | admin |

## Produção

- Defina `JWT_SECRET` com um valor longo e aleatório — a API recusa arrancar com
  `NODE_ENV=production` sem ele.
- Altere a palavra-passe do administrador criada pelo `seed`.
- Restrinja `CORS_ORIGIN` aos domínios reais da aplicação.
- Sirva a API atrás de HTTPS: sem isso a câmara não funciona e os tokens circulam em claro.
- Em servidores geridos (Neon, Render, RDS), acrescente `PGSSL=true`.

## Licença

MIT.
