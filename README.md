# Node.js + Ollama no Render

API pequena, sem dependências npm, para experimentar classificação e geração curta
com `smollm2:135m-instruct-q4_K_M`. Node.js 22+.

## Limite importante

Este projeto é um experimento para o plano **Free**. O Render informa 512 MB de RAM
e 0,1 CPU nesse plano. O arquivo do modelo tem cerca de 105 MB, mas a memória total
inclui Ollama, Node, contexto e buffers. **Não há garantia de caber ou responder
rapidamente.** O Docker e a inferência real não foram executados no ambiente de
autoria; os testes usam um servidor Ollama simulado. A qualidade, especialmente em
português, precisa ser medida com seus exemplos. Não é equivalente ao ChatGPT.

O serviço dorme após 15 minutos sem tráfego. A reativação leva aproximadamente um
minuto, além do carregamento do modelo. O plano gratuito tem cotas; confira o
painel e não selecione uma instância paga sem intenção. O modelo é baixado durante
o build e fica na imagem: não depende de disco persistente nem de download a cada
reinicialização. A imagem completa do Ollama é bem maior que os pesos do modelo;
o build pode ser demorado ou encontrar limites da plataforma.

## Deploy no Render

1. Extraia o ZIP e coloque **o conteúdo desta pasta** na raiz de um novo repositório
   GitHub. Inclua `Dockerfile`, `render.yaml`, os scripts e `server.js`.
2. No Render, escolha **New → Blueprint**, conecte o repositório e revise o plano
   **Free** definido em `render.yaml` antes de criar o serviço.
3. O Blueprint gera `API_KEY` automaticamente. Copie-a do painel de variáveis do
   serviço para o ambiente do backend que consumirá a API.
4. Aguarde o build e consulte `/health`. Depois consulte `/ready` com a chave.
5. Faça uma chamada real a `/classify` e acompanhe memória e logs. `/ready` confirma
   somente que o modelo está em disco; não comprova que a inferência cabe na RAM.

Se preferir **New → Web Service**, selecione o repositório, runtime **Docker**,
plano **Free**, health check `/health` e configure manualmente `API_KEY`.
Não configure build/start command de Node: o Docker já inicia os dois processos.

Somente a porta Node (`PORT`, padrão 10000) é pública. Ollama escuta em
`127.0.0.1:11434`. Não exponha essa porta diretamente.

## Swagger (documentação interativa)

Após iniciar o serviço, abra `http://localhost:10000/docs` ou acrescente `/docs`
à URL do Render. Clique em **Authorize**, cole somente o valor de `API_KEY`
(sem escrever `Bearer`), selecione uma rota e use **Try it out → Execute**.
A chave não é gravada em localStorage; autorize novamente ao recarregar.
`/docs`, `/docs/` e `/openapi.json` são públicos. As rotas de inferência continuam
exigindo autenticação. Nenhuma chave é incluída na página ou no contrato.

O contrato OpenAPI 3.0.3 está em `openapi.json` e inclui as quatro rotas, exemplos,
limites e respostas de erro. A UI faz chamadas para o mesmo servidor, funcionando
localmente e no Render sem configurar a URL. O navegador precisa de internet para
carregar JS/CSS do Swagger UI 5.17.14 pela CDN unpkg; a API não ganhou dependências
npm. O validador externo está desativado. Para uso offline, seria necessário
empacotar esses arquivos estáticos no projeto.

## Uso pelo seu backend Node.js

Configure `LLM_URL` com a URL do Render e `LLM_API_KEY` com a chave gerada.
Este exemplo deve rodar **no backend**, nunca com uma chave embutida em
Angular, React, Flutter ou outro aplicativo distribuído aos usuários.

```js
const response = await fetch(`${process.env.LLM_URL}/classify`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.LLM_API_KEY}`,
  },
  body: JSON.stringify({
    text: 'Gostei muito do atendimento!',
    categories: ['elogio', 'reclamacao', 'duvida'],
  }),
  signal: AbortSignal.timeout(240_000), // permite cold start; servidor limita inferência a 120s
});
if (!response.ok) throw new Error(`LLM respondeu HTTP ${response.status}`);
console.log(await response.json());
// Formato esperado (a categoria depende do modelo):
// { category: 'elogio', model: 'smollm2:135m-instruct-q4_K_M' }
```

Para gerar uma resposta curta, use `POST /generate` com:

```json
{"prompt":"Crie um título curto para uma promoção de frutas."}
```

Retorno: `{ "response": "texto produzido pelo modelo", "model": "..." }`.
Pode cortar a resposta ao atingir 30 tokens. Não mantém histórico de conversa.

## Executar localmente sem Docker

Instale Node.js 22+ e Ollama. Inicie Ollama (no Windows/macOS, abrir o aplicativo
normalmente basta; no Linux, use o serviço ou `ollama serve`). Depois:

```sh
ollama pull smollm2:135m-instruct-q4_K_M
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copie `.env.example` para `.env` e substitua `API_KEY` pela chave gerada. Execute:

```sh
npm start
```

Não precisa executar `npm install`: o projeto só usa módulos nativos do Node.

## Testar o container com limites parecidos

Com Docker instalado e `.env` preenchido:

```sh
docker build -t ollama-node-render .
docker run --rm --name ollama-node-test --memory=512m --memory-swap=512m --cpus=0.1 --env-file .env -p 10000:10000 ollama-node-render
```

Em outro terminal, faça a chamada de inferência e execute `docker stats`.
Esse teste ajuda a avaliar o consumo, mas não reproduz exatamente o Render.
As imagens base usam tags móveis (`node:22-bookworm-slim`, `ollama/ollama:latest`);
após validar o deploy, fixe seus digests para builds reproduzíveis.

## Contratos e proteções

| Rota | Autenticação | Uso |
| --- | --- | --- |
| `GET /health` | Não | Processo Node ativo; não carrega o modelo |
| `GET /ready` | Bearer | Confere Ollama e modelo em disco |
| `POST /classify` | Bearer | `text` e 2–3 `categories` |
| `POST /generate` | Bearer | `prompt` |

- Texto de entrada: até 600 caracteres. JSON: até 8 KB.
- Categorias distintas: até 24 letras/números/hífen/sublinhado cada.
- Uma inferência por vez, sem fila na API. Outra chamada recebe 429 com Retry-After.
- Contexto: 512 tokens. Saída: 16 tokens na classificação e 30 na geração.
- Contexto muito grande pode ser truncado pelo executor. Prefira frases curtas.
- Temperatura zero, uma thread e inferência CPU. Modelo permanece carregado por 2 minutos.
- 120 segundos de timeout. Desconexão aborta a chamada upstream; Ollama pode levar
  algum tempo para liberar o trabalho. O limite de paralelismo também é aplicado nele.
- Chave obrigatória de pelo menos 32 caracteres. Nenhum prompt/chave é registrado
  pela API Node; confira separadamente o comportamento e os logs do Ollama.
- Não fornece acesso público aos endpoints administrativos do Ollama.
- Validação da categoria não comprova acerto semântico e não elimina prompt injection.
  Não execute ações irreversíveis com base nesse resultado sem validação adicional.

| Status | Significado |
| --- | --- |
| 400 / 413 / 415 | Entrada inválida / grande demais / Content-Type incorreto |
| 401 | Chave ausente ou incorreta |
| 422 | Modelo respondeu algo fora das categorias |
| 429 | Já existe uma inferência em andamento |
| 502 | Resposta upstream incompatível |
| 503 | Ollama indisponível, modelo ausente ou falha de inferência |
| 504 | Tempo de inferência excedido |

Se ocorrer falta de memória (OOM/exit 137), o deploy Free não está viável nessa
configuração. Não há mudança automática de plano nem fallback pago. Subir o servidor
HTTP com sucesso não comprova que o modelo funciona. Teste 20–30 exemplos reais e
meça acertos e tempo antes de integrar a um fluxo de usuários.

## Testes

```sh
npm test
```

Testes de integração HTTP com Ollama simulado: chave, entradas, contrato de
categoria, geração, falha upstream, exclusão mútua, timeout e recuperação.
Não medem a qualidade do modelo nem seu consumo de RAM.

## Referências

- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
- https://docs.ollama.com/docker
- https://docs.ollama.com/api/generate
- https://docs.ollama.com/faq
- https://ollama.com/library/smollm2:135m-instruct-q4_K_M
