import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

function readPackage(packageName) {
  let current = path.dirname(require.resolve(packageName));
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'package.json');
    if (existsSync(candidate)) {
      return {
        packageJson: JSON.parse(readFileSync(candidate, 'utf8')),
        packagePath: candidate
      };
    }
    current = path.dirname(current);
  }
  throw new Error(`Unable to locate package.json for ${packageName}`);
}

const vuePackage = readPackage('vue');
const routerPackage = readPackage('vue-router');
const testUtilsPackage = readPackage('@vue/test-utils');
const pluginPackage = readPackage('@vitejs/plugin-vue2');

const resolved = {
  vue: {
    version: vuePackage.packageJson.version,
    path: vuePackage.packagePath
  },
  vueRouter: {
    version: routerPackage.packageJson.version,
    path: routerPackage.packagePath
  },
  vueTestUtils: {
    version: testUtilsPackage.packageJson.version,
    path: testUtilsPackage.packagePath
  },
  pluginVue2: {
    version: pluginPackage.packageJson.version,
    path: pluginPackage.packagePath
  }
};

const serialized = JSON.stringify(resolved, null, 2);
console.log(serialized);

const desktopPathMarker = `${path.sep}apps${path.sep}desktop${path.sep}`;
const wrongVersion =
  resolved.vue.version !== '2.7.16' ||
  resolved.vueRouter.version !== '3.6.5' ||
  resolved.vueTestUtils.version !== '1.3.6' ||
  resolved.pluginVue2.version !== '2.3.4';
const desktopImport = serialized.includes(desktopPathMarker);

if (wrongVersion || desktopImport) {
  process.exit(1);
}
