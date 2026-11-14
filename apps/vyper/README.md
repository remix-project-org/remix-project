# vyper-remix
Vyper Plugin for Remix Web3.


## How to get started
### Remote plugin
This plugin is hosted at https://remix-ide.readthedocs.io/en/latest/vyper.html .
To use it, open the plugin manager in Remix and click the `Activate` button in front of the `Vyper` button in the plugin section.

### Local plugin
You can host this plugin in your local environment.

```git clone https://github.com/ethereum/remix-project```

```cd remix-project```

```yarn install```

```nx build vyper```

```nx serve vyper```

## How to use plugin
1. Write vyper code(.vy) in the editor
2. Click Compile button
3. Now you can deploy the contract in the Run tab!


## Load example contracts
It is possible to clone the Vyper repository in Remix in order to use example contracts. Click on `Clone Vyper Repository`.
Once it is cloned, you will find the contract in the `examples` folder.

### Local Vyper Compiler
You can use your local Vyper compiler by selecting the radio button `Local` .
First, you need to install Vyper. It is strongly recommended to install Vyper in a virtual Python environment.

```pip3 install vyper```

(see [installing-vyper](https://vyper.readthedocs.io/en/latest/installing-vyper.html#installing-vyper)).

Then, Vyper compiler starts with this command (default: http://localhost:8000).

```vyper-serve```
