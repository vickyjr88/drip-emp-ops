/**
 * Lints the tour catalogue against the source: every `anchor` referenced by a
 * step must exist as a data-tour attribute somewhere under web/app.
 *
 * Missing anchors are skipped gracefully at runtime, so this never breaks a
 * user -- but a skipped step is a silently degraded tour, which is exactly the
 * rot this check exists to catch. Run it in CI alongside the typecheck:
 *
 *   node app/portal/tours/check-anchors.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..', '..');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

const sources = walk(appRoot);

// Anchors declared in the UI as literals: data-tour="x".
const declared = new Set();
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/data-tour=["']([^"']+)["']/g)) declared.add(m[1]);
}

/**
 * The nav renders its anchors as data-tour={`nav.${item.key}`}, so the literal
 * scan above cannot see them. Expand that one known template against the real
 * PortalNavKey union rather than accepting any string under `nav.` -- otherwise
 * a typo like nav.analitycs would lint clean and silently skip at runtime.
 */
const shell = readFileSync(join(appRoot, 'portal', 'components', 'portal-shell.tsx'), 'utf8');
const navUnion = shell.match(/export type PortalNavKey =([\s\S]*?);/);
if (navUnion) {
  for (const m of navUnion[1].matchAll(/'([^']+)'/g)) declared.add(`nav.${m[1]}`);
}

// Anchors referenced by the catalogue.
const catalogue = readFileSync(join(here, 'catalogue.ts'), 'utf8');
const referenced = [...catalogue.matchAll(/anchor:\s*'([^']+)'/g)].map((m) => m[1]);

const missing = referenced.filter((anchor) => !declared.has(anchor));

if (missing.length) {
  console.error('Tour anchors referenced but not found in web/app:');
  for (const anchor of missing) console.error(`  - ${anchor}`);
  console.error(
    '\nAdd data-tour="<anchor>" to the element, or remove the step from catalogue.ts.',
  );
  process.exit(1);
}

console.log(
  `Tour anchors OK: ${referenced.length} referenced, ${declared.size} declared.`,
);
