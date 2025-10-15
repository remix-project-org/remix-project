/* eslint-disable @typescript-eslint/no-explicit-any */
import { Plugin } from "@remixproject/engine";
import { EventEmitter } from "events";
export interface LocaleModule extends Plugin<any, any> {
    currentLocaleState: Record<string, unknown>;
    new(): any;
    events: EventEmitter;
    _deps: {
        config: any;
    };

    element: HTMLDivElement;
    locales: {[key: string]: Locale};
    active: string;
    forced: boolean;
    render(): HTMLDivElement;
    renderComponent(): void;
    /** Return the active locale */
    currentLocale(): Locale;
    /** Returns all locales as an array */
    getLocales(): Locale[];
    /**
     * Change the current locale
     * @param {string} [localeCode] - The code of the locale
     */
    switchLocale(localeCode?: string): void;
}

interface Locale { code: string, name: string; localeName: string; messages: any }
