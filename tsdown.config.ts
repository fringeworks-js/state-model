import createTsdownConfig from '@fringeworks/dev/createTsdownConfig';

export default createTsdownConfig({
  // 既定の対象から、テストで使うデータ（_fixtures.ts）を除く
  entry: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.test-d.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/*.d.{ts,tsx}',
    '!src/**/_fixtures.ts',
  ],
});
