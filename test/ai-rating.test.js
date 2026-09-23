import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadinessAssessor } from '../src/ai-rating.js';
import { fields } from '../src/rating.js';

test('AI readiness uses a structured per-aspect assessment instead of field presence', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    const aspects = Object.keys(fields).map(key => ({ key, points: 10, feedback: `Уточните ${key}` }));
    return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ aspects }) }] }] }) };
  };
  const assess = createReadinessAssessor({ apiKey: 'test-key', model: 'test-model', fetchImpl });
  const result = await assess(Object.fromEntries(Object.keys(fields).map(key => [key, 'Поле заполнено'])));

  assert.equal(result.score, 51);
  assert.equal(result.source, 'ai');
  assert.equal(result.breakdown.every(item => item.points === Math.round(item.max / 2)), true);
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'test-model');
  assert.equal(body.text.format.type, 'json_schema');
});

test('readiness degrades visibly to partial local scoring without an API key', async () => {
  const assess = createReadinessAssessor({ apiKey: '' });
  const result = await assess({ context: 'Проблема' });
  assert.equal(result.source, 'local');
  assert.match(result.warning, /OPENAI_API_KEY/);
  assert.ok(result.score > 0 && result.score < fields.context[1]);
});
