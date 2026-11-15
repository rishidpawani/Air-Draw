import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAirDrawFile, serializeAirDrawFile } from './storage';
import type { BoardState } from '../types/board';

test('serializeAirDrawFile and parseAirDrawFile roundtrip full board state', () => {
  const sample: BoardState = {
    theme: 'dark',
    viewport: { panX: -120, panY: 85, zoom: 1.35 },
    shapes: [
      {
        id: 's1',
        kind: 'rectangle',
        x: 50,
        y: 60,
        width: 140,
        height: 90,
        strokeColor: 'auto',
        fillColor: 'transparent',
        strokeWidth: 2.5,
        text: 'Start',
        fontSize: 18,
        seed: 7,
      },
      {
        id: 's2',
        kind: 'circle',
        x: 300,
        y: 60,
        width: 110,
        height: 110,
        strokeColor: '#3b82f6',
        fillColor: 'transparent',
        strokeWidth: 2.5,
        text: 'End',
        fontSize: 18,
        seed: 9,
      },
    ],
    connectors: [
      {
        id: 'c1',
        fromShapeId: 's1',
        toShapeId: 's2',
        strokeColor: 'auto',
        strokeWidth: 2.5,
      },
    ],
  };

  const json = serializeAirDrawFile(sample);
  const restored = parseAirDrawFile(json);

  assert.equal(restored.type, 'airdraw');
  assert.equal(restored.theme, 'dark');
  assert.deepEqual(restored.viewport, sample.viewport);
  assert.equal(restored.shapes.length, 2);
  assert.equal(restored.shapes[0].text, 'Start');
  assert.equal(restored.shapes[1].strokeColor, '#3b82f6');
  assert.equal(restored.shapes[1].color, '#3b82f6');
  assert.equal(restored.connectors.length, 1);
  assert.equal(restored.connectors[0].fromShapeId, 's1');

  const rawParsed = JSON.parse(json);
  assert.equal(rawParsed.shapes[1].color, '#3b82f6');
  assert.equal(rawParsed.connectors[0].color, 'auto');
});

test('parseAirDrawFile restores fallback color property when strokeColor is omitted', () => {
  const legacyColorOnly = JSON.stringify({
    type: 'airdraw',
    version: 1,
    theme: 'dark',
    viewport: { panX: 0, panY: 0, zoom: 1 },
    shapes: [{ id: 's1', kind: 'rectangle', x: 0, y: 0, width: 100, height: 80, color: '#00B4FF' }],
    connectors: [],
  });
  const parsed = parseAirDrawFile(legacyColorOnly);
  assert.equal(parsed.shapes[0].strokeColor, '#00B4FF');
  assert.equal(parsed.shapes[0].color, '#00B4FF');
});

test('parseAirDrawFile rejects invalid JSON or wrong file signature', () => {
  assert.throws(() => parseAirDrawFile('not json'), /not valid JSON/);
  assert.throws(() => parseAirDrawFile('{"type":"other"}'), /missing "type": "airdraw"/);
});
