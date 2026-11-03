import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const catalogPath = resolve(process.argv[2] ?? 'docs/models/catalog.json')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
if (!Array.isArray(catalog.models) || !catalog.as_of || !catalog.match_rule) throw new Error('Invalid model catalog')
writeFileSync(new URL('../lib/model-catalog.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n')
console.log('Updated packaged model catalog from ' + catalogPath)
