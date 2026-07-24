# remix-ui

This library was generated with [Nx](https://nx.dev).

## Prerequisite

- Install **NxConsole** vscode extension

## Steps To Generate React App

- Open **NxConsole** extension
- Click generate option
- Select **@nx/react - application**
- Enter the name of the application
- Set **e2eTestRunner** to **none**. (This is because we run e2e tests with nightwatch)
- Set **unitTestRunner** to **none**.
- Click the run button in the top right corner of the generate page.
- Your react application should be created in **{root}/apps** directory.

## Steps To Generate React Lib

- Open **NxConsole** extension
- Click generate option
- Select **@nx/react - library**
- Enter the name of the library
- Set **directory** to **remix-ui**
- Set **importPath** to **@remix-ui/{library-name}**
- Set **unitTestRunner** to **none**.
- Click the run button in the top right corner of the generate page.
- Your react library should be created in **{root}/libs/remix-ui** directory.

## Steps To Generate React Component

- Open **NxConsole** extension
- Click generate option
- Select **@nx/react - component**
- Enter the name of the component
- Select the name of the project/library that uses the component. (e.g TreeView library)
- Set component directory if needed.
- Click the run button in the top right corner of the generate page.
- Your react component should be created with the project/library name specified.
