/**
 * App Theme and Locale Setup
 *
 * Handles initialization of theme and locale modules and registry setup
 */

import { ThemeModule } from '../tabs/theme-module';
import { LocaleModule } from '../tabs/locale-module';
import { Registry } from '@remix-project/remix-lib';

/**
 * Initialize theme and locale modules and register settings config
 */
export function setupThemeAndLocale(): void {
  const theme = new ThemeModule();
  theme.initTheme();

  const locale = new LocaleModule();
  const settingsConfig = {
    themes: theme.getThemes(),
    locales: locale.getLocales()
  };

  Registry.getInstance().put({ api: settingsConfig, name: 'settingsConfig' });
}