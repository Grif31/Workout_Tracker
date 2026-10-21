/**
 * iOS links one pod per native module, from the top-level copy in
 * node_modules. When npm nests a second, newer copy of an Expo package under
 * the package that needs it, that package compiles against the older top-level
 * one: 1.2.0's first production build failed in Xcode because expo-widgets
 * 57.0.26 needed @expo/ui 57.0.25 (WidgetKitModifiers) and the app's
 * package.json still pinned ~57.0.20. Nothing in tsc or Jest saw it.
 *
 * The fix for a failure here is the one CLAUDE.md gives for SDK upgrades:
 * write what `npx expo install --check` expects into package.json and run
 * one `npm install`.
 */
import fs from 'fs';
import path from 'path';

const NODE_MODULES = path.join(__dirname, '..', 'node_modules');

function packageDirs(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).flatMap(name => {
    if (name.startsWith('.')) return [];
    if (name.startsWith('@')) {
      return fs.readdirSync(path.join(root, name)).map(sub => path.join(root, name, sub));
    }
    return [path.join(root, name)];
  });
}

// "expo-widgets" or "@expo/ui" for a package directory at any depth
function packageName(dir: string): string {
  const scope = path.basename(path.dirname(dir));
  return scope.startsWith('@') ? `${scope}/${path.basename(dir)}` : path.basename(dir);
}

function isExpoNative(dir: string): boolean {
  const name = packageName(dir);
  return (name.startsWith('expo-') || name.startsWith('@expo/')) && fs.existsSync(path.join(dir, 'ios'));
}

const toPosix = (p: string) => p.split(path.sep).join('/');

describe('native Expo packages', () => {
  // A package nested with no top-level copy is fine (expo-auth-session's own
  // expo-crypto): there is still only one pod. Two copies are the problem.
  it('never have a second copy nested under another package', () => {
    const topLevel = new Set(packageDirs(NODE_MODULES).map(packageName));
    const duplicates = packageDirs(NODE_MODULES).flatMap(dir =>
      packageDirs(path.join(dir, 'node_modules'))
        .filter(inner => isExpoNative(inner) && topLevel.has(packageName(inner)))
        .map(inner => toPosix(path.relative(NODE_MODULES, inner))),
    );
    expect(duplicates).toEqual([]);
  });
});
