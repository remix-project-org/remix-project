import React, { useEffect, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { LocaleModule } from '../../types/locale-module'
import './remix-ui-locale-module.module.css'

export interface RemixUiLocaleModuleProps {
  localeModule: LocaleModule
}

export function RemixUiLocaleModule({ localeModule }: RemixUiLocaleModuleProps) {
  const [localeCode, setLocaleCode] = useState('')

  useEffect(() => {
    localeModule.switchLocale()
  }, [localeCode, localeModule])

  return (
    <div className="border-t mb-4">
      <div className="card-body pt-3 pb-2">
        <h6 className="card-title">
          <FormattedMessage id="settings.locales" />
        </h6>
        <div className="card-text locales-container mx-auto px-4">
          {localeModule.getLocales()
            ? localeModule.getLocales().map((locale, idx) => (
              <div className="radio form-check mb-1" key={idx}>
                <input
                  type="radio"
                  onChange={(event) => {
                    localeModule.switchLocale(locale.code)
                    setLocaleCode(locale.code)
                  }}
                  className="align-middle form-check-input"
                  name="locale"
                  id={locale.code}
                  data-id={`settingsTabLocale${locale.code}`}
                  checked={localeModule.active === locale.code.toLocaleLowerCase()}
                />
                <label className="form-check-label" data-id={`settingsTabLocaleLabel${locale.code}`} htmlFor={locale.code}>
                  {locale.name.toLocaleUpperCase()}-{locale.localeName}
                </label>
              </div>
            ))
            : null}
        </div>
      </div>
    </div>
  )
}

export default RemixUiLocaleModule
