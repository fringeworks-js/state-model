import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: { enabled: true },
    // 一部分のキャッシュ（WeakRef）が回収されることを確かめるため
    execArgv: ['--expose-gc'],
  },
});
