# Sindri Scripts

The `sindri/scripts/` directory contains scripts for compiling circuits and generating Zero-Knowledge Proofs remotely using [Sindri](https://sindri.app).
This README file will walk you through all of the steps necessary to compile your circuit and generate proofs.
As you read through it, you might also find it helpful to refer to external documentation:

- [Circom 2 Documentation](https://docs.circom.io/)
- [Sindri Documentation](https://sindri.app/docs/)

## Add the Sindri ZK Scripts

If you're seeing this README, then you've probably already figured out this step on your own!
You can add the Sindri ZK scripts and related project files to your workspace by clicking the hamburger icon in the upper left corner of the **File Explorer** and selecting **Add Sindri ZK scripts**.
This will automatically add this README file, several TypeScript files, a `sindri.json` project manifest, and a `.sindriignore` file to your workspace.
We'll cover these files in more detail below.

## API Key

To interact with the Sindri API, you will first need to create a Sindri account, generate an API key, and add it to your Remix Web3 settings.
This only needs to be done once, your credentials will be shared across all of your current and future workspaces once you've added your API key.

1. Visit [The Sindri Homepage](https://sindri.app/) and request a demo to create your account.
2. Follow the instructions in the [Access Management](https://sindri.app/docs/topic-guides/access-management/#api-key-creation-and-management) documentation to generate an API key.
3. Open the **Settings** panel by clicking on the gear icon at the very bottom of the icon panel on the left side of the Remix Web3 (see the [Remix Web3 Settings](https://remix-ide.readthedocs.io/en/latest/settings.html) documentation if you're having trouble finding it.
4. Navigate to the **Sindri Credentials** section of the **Settings** panel, enter your Sindri API key under **Token**, and click the **Save** button.

## Customize `sindri.json` _(Optional)_

A `sindri.json` file was added to the root of your workspace, and automatically customized to fit your project layout.
This file is the **Sindri Manifest** and is required for all projects deployed to Sindri.
It's also used by the [Sindri CLI](https://github.com/Sindri-Labs/sindri-js) for local circuit operations which don't require a Sindri account.

If the automatic customization missed something, or if you'd like to make further customizations, then you'll need to edit this file yourself.
When editing `sindri.json` in the Remix Web3, you should get in-editor diagnostics and documentation about the format of the file.
You can mouse over the different properties and their values to view their documentation and any potential errors with the values.

The fields that you're most likely to want to customize are:

- `name` - This is a unique project identifier for your circuit.
  You can think of it as being analogous to a GitHub project name or a DockerHub image name.
  Every time you compile a circuit with Sindri, the compiled circuit will be associated with the project and one or more tags (`latest` by default).
  We guessed this based on your workspace name, but you can change this to something else if you don't like that name.
- `circuitPath` - This defines the entrypoint for a Circom circuit (_i.e_ the `.circom` source file which contains your `main` component).
  We did our best to guess this as well, but you'll need to update this manually if you refactor your circuit files or the wrong entrypoint was detected.

## Customize `.sindriignore` _(Optional)_

A `.sindriignore` file was automatically added to the root of your workspace when you added the ZK scripts.
This file can be used to exclude files and directories from your circuit package when deploying it to Sindri, and it follows the [`.gitignore` Format](https://git-scm.com/docs/gitignore).
The generated file includes some sane defaults, but you can feel free to customize it as you see fit.
This is particularly useful if you want to exclude files that contain sensitive information like credentials or secret keys.
Excluding irrelevant files will also have a positive impact on the performance of compiling and generating proofs because less data needs to be transferred.

## Compile the Circuit

The `scripts/sindri/run_compile.ts` script can be used to compile a new version of your circuit.
To run it, you can open the script from the **File Explorer**, then either click the play button icon in the upper left corner of the editor panel or press `CTRL + SHIFT + S`.
After running it, you should see something like

```
Compiling circuit "multiplier2"...
Circuit compiled successfully, circuit id: f593a775-723c-4c57-8d75-196aa8c22aa0
```

indicating that the circuit compiled successfully.

By default, this newly compiled circuit will be assigned a tag of `latest` and replace any previous circuit with that tag.
If you would like to use alternative tags, you can modify the script to pass an array of tags to the `compile()` function call in the script.
We recommend starting out with the default of `latest` as you're getting started, and then moving towards tighter tag management once you're closer to productionizing your circuit.

## Generate a Proof

Once you've compiled your circuit, you're almost ready to use the `scripts/sindri/run_prove.ts` script to generate a proof.
You'll first need to modify this file to pass in the input signals that you would like to generate a proof for when calling `prove(signals)` (see Circom's [Signals & Variables](https://docs.circom.io/circom-language/signals/) documentation if you need a refresher on circuit signals).
Towards the top of the script, you'll see where the `signals` variable is defined.

```typescript
const signals: {[name: string]: number | string} = {}
```

You'll need to modify this object to include a map from your circuit's signal names to the values you would like to generate a proof with.
If the signals aren't set correctly, then you'll get an error when you try to generate a proof, so make sure you don't skip this step.

While the `scripts/sindri/run_prove.ts` script is open in the editor, you can click the play icon or press `CTRL + SHIFT + S` to run the script.
If proof generation is successful, you should see an output like this.

```
Proving circuit "multiplier2"...
Proof generated successfully, proof id: 8c457574-99cd-4042-a598-0514ee83ea28
Proof:
{
  "pi_a": [
    "6067132175610399619979395342154926888794311761598436094198046058376456187483",
    "12601521866404307402196517712981356634013036480344794909770435164414221099781",
    "1"
  ],
  "pi_b": [
    [
      "4834637265002576910303922443793957462767968914058257618737938706178679757759",
      "9112483377654285712375849001111771826297690938023943203596780715231459796539"
    ],
    [
      "10769047435756102293620257834720404252539733306406452142820929656229947907912",
      "13357635314682194333795190402038393873064494630028726306217246944693858036728"
    ],
    [
      "1",
      "0"
    ]
  ],
  "pi_c": [
    "14880777940364750676687351211095959384403767617776048892575602333362895582325",
    "16991336882479219442414889002846661737157620156103416755440340170710340617407",
    "1"
  ],
  "protocol": "groth16"
}
```

You can either manually copy the proof to wherever you would like to use it, or modify the script to save it to a dedicated location.
