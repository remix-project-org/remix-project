import { Plugin } from "@remixproject/engine";
import { EventEmitter } from "events";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ThemeModule extends Plugin<any, any> {
    currentThemeState: Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    events: EventEmitter;
    _deps: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: any;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    element: HTMLDivElement;
    // eslint-disable-next-line @typescript-eslint/ban-types
    themes: {[key: string]: Theme};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    active: string;
    forced: boolean;
    render(): HTMLDivElement;
    renderComponent(): void;
    /** Return the active theme */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentTheme(): any;
    /** Returns all themes as an array */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getThemes(): Theme[];
    /**
     * Init the theme
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initTheme(callback: any): void;
    /**
     * Change the current theme
     * @param {string} [themeName] - The name of the theme
     */
    switchTheme(themeName?: string): void;
    /**
     * fixes the inversion for images since this should be adjusted when we switch between dark/light qualified themes
     * @param {element} [image] - the dom element which invert should be fixed to increase visibility
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fixInvert(image?: any): void;
}

export interface Theme { name: string, quality: string, url: string }
