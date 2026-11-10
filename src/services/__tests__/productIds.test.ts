/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  ALL_PRODUCT_IDS,
  APP_STORE_PRODUCTS,
  PRODUCT_IDS,
} from '../iapService';

// vitest runs from the project root.
const ROOT = resolve(process.cwd());
const DEFINITION_FILE = join('src', 'services', 'iapService.ts');

// Everything a person would edit: app code, services, store, engine, and the config files.
const SCAN_DIRS = ['app', 'src'];
const SCAN_FILES = ['app.json', 'eas.json', 'package.json'];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|json|md)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.expo' || name === 'dist') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function sourceFiles(): string[] {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
  for (const f of SCAN_FILES) files.push(join(ROOT, f));
  return files;
}

describe('store product IDs live in exactly one place', () => {
  it('defines the three products the App Store knows about', () => {
    expect(ALL_PRODUCT_IDS).toHaveLength(3);
    expect(new Set(ALL_PRODUCT_IDS).size).toBe(3);
    expect(APP_STORE_PRODUCTS.map((p) => p.productId).sort()).toEqual([...ALL_PRODUCT_IDS].sort());
  });

  it('spells out each product ID only in src/services/iapService.ts', () => {
    const offenders: string[] = [];
    let definitionHits = 0;

    for (const file of sourceFiles()) {
      const rel = relative(ROOT, file);
      const text = readFileSync(file, 'utf8');
      for (const id of Object.values(PRODUCT_IDS)) {
        const count = text.split(id).length - 1;
        if (count === 0) continue;
        if (rel === DEFINITION_FILE) {
          definitionHits += count;
        } else {
          offenders.push(`${rel} contains ${id}`);
        }
      }
    }

    expect(offenders).toEqual([]);
    // Each ID is written exactly once in the definition file (the PRODUCT_IDS object).
    expect(definitionHits).toBe(Object.values(PRODUCT_IDS).length);
  });

  it('has no purchasable ID for the free plan', () => {
    const prefix = Object.values(PRODUCT_IDS)[0].replace(/\.[^.]+$/, '');
    const freeId = `${prefix}.free`;
    for (const file of sourceFiles()) {
      expect(readFileSync(file, 'utf8').includes(freeId), relative(ROOT, file)).toBe(false);
    }
  });
});
