# How to run and write tests for Remix Desktop


### Basic procedure of local testing

- create a release executable of desktop
- run local remix-ide 
- run the test

### Executables

Testing runs through nightwatch that treats an electron application as a special version of chrome, which it is. It basically calls the executable which is built by the yarn dist -c test_only.json script which creates executables based on the current channel configuration package.json, ie "version": "1.0.8-insiders"

Executables are stored in the ./release directory. Without that executable you cannot run tests. You cannot call tests on local development instance that is launched by yarn start:dev. You need to create an executable file first. 

This is done by running yarn dist -c test_only.json

Normally when you would do a 'real' release you would package Remix Web3 into the distributable but for local e2e this is not  necessary because it will use the Remix Web3 that is being served.


```
            switch (type) {
              case 'Windows_NT':
                binaryPath = `./release/win-unpacked/Remix-Desktop-${channel}.exe`;
                break;
              case 'Darwin':
                binaryPath = arch === 'x64' ? 
                  `release/mac/Remix-Desktop-${channel}.app/Contents/MacOS/Remix-Desktop-${channel}` :
                  `release/mac-arm64/Remix-Desktop-${channel}.app/Contents/MacOS/Remix-Desktop-${channel}`;
                break;
              case 'Linux':
                binaryPath = "release/linux-unpacked/remixdesktop";
                break;
```

### Local testing

In order to facilitate local testing nightwatch will boot the executable with the --e2e-local flag when running locally ( so outside of CIRCLE CI ). This means the electron app will load the local running Remix Web3.

So to start testing locally 
- run the IDE with 'yarn serve' as you would normally do.
- build your release. You will always need to do this when the Desktop app itself changes its code. 
    - yarn dist -c test_only.json
- in apps/remixdesktop: 
    - yarn build:e2e
    - run the test you want, refer to the actual JS that is build, not the TS, ie 
    yarn test --test ./build-e2e/remixdesktop/test/tests/app/compiler.test.js

### Hot reload on local tests

When Remix Web3 changes the electron window that is open will hot reload just like a browser. But when you change electron code you need to rebuild the release.

### Filesystem & native dialogs

Because you cannot access anything outside of the chrome context with nightwatch, like filesystem dialogs, the filesystem plugin in electron behaves different when it comes to e2e. 

These functions have been replaced with special versions:
```
selectFolder
openFolder
openFolderInSameWindow
```

Basically when the app tries to open a folder where your 'workspace' is located it creates a random directory if you haven't specified a specific dir: 
```
 const randomdir = path.join(os.homedir(), 'remix-tests' + Date.now().toString())
```
So that means when the test loads a template it will put the contents of it in a random dir.

When you know which directory you need to open you can call it on the window in the test:
```
  browser.executeAsync(function (dir, done) {
      (window as any).electronAPI.openFolderInSameWindow(dir + '/hello_foundry/').then(done)
  }, [dir], () => {
      console.log('done window opened')
  })
```

You can see this behavior in action too when using 
```
yarn start:dev --e2e-local
```

### Window handling

The electron app always starts in a mode where there is no 'workspace'. You need to open one and that creates a new window unless you call openFolderInSameWindow.

When you open a folder which is not in the same window, so ie you load a template electron creates a new window, so you need to switch to it:

```
.windowHandles(function (result) {
  console.log(result.value)
  browser.switchWindow(result.value[1])
```

### OS filtering

Remember tests will run on Machine OS instances, you will need to filter tests that use certain features of an OS

```
module.exports = {
    ...process.platform.startsWith('win')?{}:tests
}
```

### hiding tooltips

Always use this, it avoids trouble: 
```
browser.hideToolTips()
```













