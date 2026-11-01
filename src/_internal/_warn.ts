import { warnInDevelopment } from '@fringeworks/utils';

/**
 * 開発時だけ警告する
 */
export default function _warn(message: string): void {
  warnInDevelopment(`[@fringeworks/state-model] ${message}`);
}
