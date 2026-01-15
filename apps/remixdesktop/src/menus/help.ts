import {BrowserWindow, MenuItemConstructorOptions, app} from 'electron';
const { dialog, shell } = require('electron')
export default (
  commandKeys: Record<string, string>,
  execCommand: (command: string, focusedWindow?: BrowserWindow) => void
): MenuItemConstructorOptions => {
  const isMac = process.platform === 'darwin';

  return {
    label:  'Help',
    submenu: [
      {
        label: `About Remix Desktop version ${app.getVersion()}`,
        click(item, focusedWindow) {
          dialog.showMessageBox({
            title: `About Remix`,
            message: `Version info`,
            detail: `Remix Desktop version ${app.getVersion()}`,
            buttons: [],
          });
        }
      },
      {
        label: 'Report an issue',
        click(item, focusedWindow) {
          shell.openExternal('https://github.com/remix-project-org/remix-project/issues/new?template=bug_report.md')
        }
      }
    ]
  };
};
