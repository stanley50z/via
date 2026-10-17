import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createInstance} from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import {i18nOptions} from '../src/i18n-options';
import en from '../src/locales/en.json';
import zh from '../src/locales/zh.json';

test('Chinese includes the OS Keyboard controls and curve presets', async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: 'zh-CN',
    fallbackLng: 'en',
    resources: {en: {translation: en}, zh: {translation: zh}},
    interpolation: {escapeValue: false},
  });
  assert.equal(i18n.t('Mouse Sensitivity'), '鼠标灵敏度');
  assert.equal(i18n.t('Left Joystick'), '左摇杆');
  assert.equal(i18n.t('Mouse Speed Curve'), '鼠标速度曲线');
  assert.equal(i18n.t('Linear'), '线性');
  assert.equal(i18n.t('Save Right Curve'), '保存右侧曲线');
  assert.equal(
    i18n.t('Joystick Key Activation Threshold (%)'),
    '摇杆按键触发阈值 (%)',
  );
});

// Simulate browser-owned inputs, using the real detector and translation engine.
async function detectLanguage(
  languages: string[],
  saved?: string,
  search = '',
) {
  const values = new Map(saved ? [['i18nextLng', saved]] : []);
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const originals = ['window', 'navigator', 'document'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage,
      location: {search, hash: '', pathname: '/', hostname: 'localhost'},
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      languages,
      language: languages[0],
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      cookie: '',
      documentElement: {getAttribute: () => null},
    },
  });
  const i18n = createInstance().use(LanguageDetector);
  try {
    await i18n.init({
      ...i18nOptions,
      resources: {en: {translation: en}, zh: {translation: zh}},
    });
    return {i18n, values};
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('a saved language choice wins over browser and URL language', async () => {
  const {i18n} = await detectLanguage(['en-US'], 'zh', '?lng=en');
  assert.equal(i18n.t('Configure'), '配置');
});

test('browser preferences select the first supported language', async () => {
  const {i18n} = await detectLanguage(['fr-FR', 'zh-CN', 'en-US']);
  assert.equal(i18n.t('Configure'), '配置');
});

for (const language of ['zh', 'zh-CN', 'zh-TW', 'zh-Hans', 'zh-Hant']) {
  test(`${language} loads the existing Simplified Chinese translation`, async () => {
    const {i18n} = await detectLanguage([language]);
    assert.equal(i18n.resolvedLanguage, 'zh');
    assert.equal(i18n.t('Mouse Sensitivity'), '鼠标灵敏度');
  });
}

test('unsupported browser languages fall back to English', async () => {
  const {i18n} = await detectLanguage(['fr-FR']);
  assert.equal(i18n.resolvedLanguage, 'en');
  assert.equal(i18n.t('Configure'), 'Configure');
});

test('a saved English choice is not overridden by a Chinese browser', async () => {
  const {i18n, values} = await detectLanguage(['zh-CN'], 'en');
  assert.equal(i18n.t('Configure'), 'Configure');
  assert.equal(values.get('i18nextLng'), 'en');
});

test('mode status translates mode names and unknown-mode numbers', async () => {
  const {i18n} = await detectLanguage(['zh-CN']);
  const key =
    'Both joysticks set to Mouse mode. Previous — Left: {{left}}, Right: {{right}}';
  assert.equal(
    i18n.t(key, {left: i18n.t('Gaming'), right: i18n.t('Keypad')}),
    '两个摇杆均已设为鼠标模式。原模式：左侧 游戏，右侧 按键',
  );
  assert.equal(i18n.t('Unknown ({{mode}})', {mode: 7}), '未知 (7)');
});
