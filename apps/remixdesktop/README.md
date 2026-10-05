# REMIX DESKTOP

## Development

### Running the app locally

In the main repo run yarn, then run yarn serve  
In this directory apps/remixdesktop, yarn, then run: yarn start:dev to boot the electron app

Then, the app will be started in live reload mode, and anything you do in Remix Web3 will be reloaded.
It will not however reload electron code. You need to rerun yarn start:dev every time. 

If you run into issues with yarn when native node modules are being rebuilt, you need
- Windows: install Visual Studio Tools with Desktop Development C++ enabled in the Workloads
- MacOS: install Xcode or Xcode Command Line Tools. Also make sure the compilers (clang++ | g++) target the right sdk includes, ```export SDKROOT="xcrun --show-sdk-path"```
- Linux: unknown, probably a C++ compiler


### Electron Plugin

Electron has its own Plugin Engine, which holds plugins, these plugins have plugin clients attached to them. Each of those clients is created when an instance of Remix Desktop connects
and activates a plugin. Follow all these steps to make that work.

1. create a plugin file in apps/remixdesktop/src/plugins
2. add imports: 
```
import { Profile } from '@remixproject/plugin-utils'
import { ElectronBasePlugin, ElectronBasePluginClient } from '@remixproject/plugin-electron'
```
3. add a base profile and a client profile:
```
const profile: Profile = {
  displayName: 'compilerLoader',
  name: 'compilerloader',
  description: 'Compiler Loader',
}
const clientProfile: Profile = {
  name: 'compilerloader',
  displayName: 'compilerloader',
  description: 'Compiler Loader',
  methods: ['downloadCompiler', 'listCompilers', 'getBaseUrls', 'getJsonBinData'],
}
```

As you can see in the clientProfile you define the methods which are exposed to the Remix plugin system.

4. add a base plugin and a plugin client
```
export class CompilerLoaderPlugin extends ElectronBasePlugin {
  clients: CompilerLoaderPluginClient[] = []
  constructor() {
    super(profile, clientProfile, CompilerLoaderPluginClient)
    this.methods = [...super.methods]
  }
}

class CompilerLoaderPluginClient extends ElectronBasePluginClient {
  solJsonBinData: iSolJsonBinData
  constructor(webContentsId: number, profile: Profile) {
    super(webContentsId, profile)
  }

  async onActivation(): Promise<void> {
    this.onload(() => {
      this.emit('loaded')
    })
  }
}
```
The ElectronBasePluginClient is the specific instance which will be connected to the IDE. The BasePlugin is just holding all the clients for all the instances.

Any instance specific code is set as functions on the ElectronBasePluginClient class.

5. If you need fs access you need to track the workingdir like we do here:
This ensures you know where the user is working

```

class IsoGitPluginClient extends ElectronBasePluginClient {
  workingDir: string = ''

  constructor(webContentsId: number, profile: Profile) {
    super(webContentsId, profile)
    this.onload(async () => {
      this.on('fs' as any, 'workingDirChanged', async (path: string) => {
        this.workingDir = path
      })
      this.workingDir = await this.call('fs' as any, 'getWorkingDir')

    })
  }

  ```

6. If you need to call methods on the BASE which holds all the clients you can add methods there, for example this iterates over clients 
and finds the one with the webContentsId. This ID passed on ie by menu items. Look at menu.ts to see how that works.

```
  openTemplate(webContentsId: any): void {
    const client = this.clients.find(c => c.webContentsId === webContentsId)
    if (client) {
      client.openTemplate()
    }
  }
```

7. Add your plugin to engine.ts

```
const compilerLoaderPlugin = new CompilerLoaderPlugin()
```

8. Register the plugin in engine.ts

```
engine.register(compilerLoaderPlugin)
```

9. activation of plugins is done when the clients connect to the engine. No need to activate it. 

10. Add the plugin to the preload.ts. Add it to this list:

```
const exposedPLugins = ['fs', 'git', 'xterm', 'isogit', 'electronconfig', 'electronTemplates', 'ripgrep', 'compilerloader', 'appUpdater']
```

If you don't do this, it won't work.

11. In Remix Web3 create a plugin in src/app/plugins/electron. If everything works correctly the methods will be loaded from the electron side, no need to specify them here.
This plugin is only a passthrough. 

```
const profile = {
  displayName: 'compilerLoader',
  name: 'compilerloader',
  description: 'Loads the compiler for offline use',
}

export class compilerLoaderPluginDesktop extends ElectronPlugin {
  constructor() {
    super(profile)
    this.methods = []
  }

  async onActivation(): Promise<void> {
  
   // something to do

  }
}
```

12. if you need to activate that on load you need to add it to the app.js where other plugins are activated.



## CI

CI will only run the builds if the branch is master or contains the word: desktop
