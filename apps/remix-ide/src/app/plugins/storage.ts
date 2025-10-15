import { Plugin } from '@remixproject/engine';

const profile = {
  name: 'storage',
  displayName: 'Storage',
  description: 'Storage',
  methods: ['getStorage', 'formatString']
};

export class StoragePlugin extends Plugin {
  constructor() {
    super(profile);
  }

  async getStorage() {
    let storage = null
    if ('storage' in navigator && 'estimate' in navigator.storage && (window as any).remixFileSystem.name !== 'localstorage') {
      storage = await navigator.storage.estimate()
    } else {
      storage ={
        usage: parseFloat(this.calculateLocalStorage()) * 1000,
        quota: 5000000,
      }
    }
    return storage
  }

  formatString(storage) {
    return `${this.formatBytes(storage.usage)} / ${this.formatBytes(storage.quota)}`;
  }

  calculateLocalStorage() {
    let _lsTotal = 0
    let _xLen; let _x
    for (_x in localStorage) {
      // eslint-disable-next-line no-prototype-builtins
      if (!localStorage.hasOwnProperty(_x)) {
        continue
      }
      _xLen = ((localStorage[_x].length + _x.length))
      _lsTotal += _xLen
    }
    return (_lsTotal / 1024).toFixed(2)
  }

  formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}
