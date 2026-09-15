import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createApp } from '../server.js';

const apiKey = 'a'.repeat(64);
async function listen(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
test('API: autenticação, contratos, falhas, concorrência e timeout', async t => {
  let reply = 'elogio', delay = 0, upstreamStatus = 200, captured;
  let notify;
  const mock = http.createServer(async (req, res) => {
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'smollm2:135m-instruct-q4_K_M' }] }));
    let raw = ''; for await (const chunk of req) raw += chunk;
    captured = JSON.parse(raw);
    notify?.();
    await new Promise(resolve => setTimeout(resolve, delay));
    res.writeHead(upstreamStatus).end(JSON.stringify({ response: reply, done: true }));
  });
  const ollamaUrl = await listen(mock);
  const api = createApp({ apiKey, ollamaUrl, timeoutMs: 250 });
  const url = await listen(api);
  const call = (path, body, auth = true) => fetch(url + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body) });
  const valid = { text: 'Gostei!', categories: ['elogio', 'reclamacao'] };
  try {
    await t.test('exige chave forte na configuração', () => assert.throws(() => createApp({ apiKey: 'short' })));
    await t.test('health público e ready autenticado', async () => {
      assert.equal((await fetch(url + '/health')).status, 200);
      assert.equal((await fetch(url + '/ready')).status, 401);
      assert.equal((await fetch(url + '/ready', { headers: { Authorization: `Bearer ${apiKey}` } })).status, 200);
    });
    await t.test('bloqueia chamada sem chave', async () => assert.equal((await call('/classify', valid, false)).status, 401));
    await t.test('rejeita entradas inválidas', async () => {
      for (const body of ['{broken', null, {}, { ...valid, text: 'x'.repeat(601) },
        { ...valid, categories: ['a', 'A'] }]) assert.equal((await call('/classify', body)).status, 400);
      assert.equal((await call('/generate', { prompt: 'x'.repeat(9000) })).status, 413);
    });
    await t.test('classifica e fixa os limites de inferência', async () => {
      const res = await call('/classify', valid); assert.equal(res.status, 200);
      assert.equal((await res.json()).category, 'elogio');
      assert.equal(captured.options.num_ctx, 512); assert.equal(captured.options.num_gpu, 0);
      assert.equal(captured.stream, false);
    });
    await t.test('não inventa categoria para resposta fora do contrato', async () => {
      reply = 'não sei'; assert.equal((await call('/classify', valid)).status, 422);
    });
    await t.test('gera texto curto', async () => {
      reply = 'Olá'; const res = await call('/generate', { prompt: 'Diga olá' });
      assert.equal((await res.json()).response, 'Olá'); assert.equal(captured.options.num_predict, 30);
    });
    await t.test('falha upstream é 503 e libera o próximo pedido', async () => {
      upstreamStatus = 500; assert.equal((await call('/classify', valid)).status, 503);
      upstreamStatus = 200; reply = 'elogio'; assert.equal((await call('/classify', valid)).status, 200);
    });
    await t.test('somente uma inferência por vez', async () => {
      delay = 100;
      const arrived = new Promise(resolve => { notify = resolve; });
      const first = call('/classify', valid); await arrived; notify = undefined;
      assert.equal((await call('/classify', valid)).status, 429);
      assert.equal((await first).status, 200); delay = 0;
    });
    await t.test('timeout não deixa API bloqueada', async () => {
      delay = 400; assert.equal((await call('/classify', valid)).status, 504);
      delay = 0; assert.equal((await call('/classify', valid)).status, 200);
    });
  } finally { await close(api); await close(mock); }
});
