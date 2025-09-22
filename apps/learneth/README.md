# Remix LearnEth Plugin

## Available Scripts

In the project directory, you can run:

### `npm run serve:plugin --plugin=learneth`

Runs the app in the development mode.\
Open [http://localhost:2024](http://localhost:2024) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm run build:plugin --plugin=learneth`

Builds the app for production to the `dist/apps/learneth` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

## Loading the plugin in remix

When testing with localhost you should use the HTTP version of either REMIX or REMIX ALPHA. Click on the plugin manager icon and
add the plugin 'Connect to a local plugin'. Your plugin will be at http://localhost:2024/.

## Setting up the REMIX IDE for working with the plugin

The plugin only works when a compiler environment is loaded as well, for example on the home screen of the IDE you select 'Solidity' or 'Vyper'. Without this the plugin
cannot compile and test files in the workshops.

## Setting up your Github workshops repo

You can create your own workshops that can be imported in the plugin.
When importing a github repo the plugin will look for a directory structure describing the workshops.
For example: https://github.com/remix-project-org/remix-workshops

### Root directories

Root directories are individual workshops, the name used will be the name of the workshop unless you override this with the name property in the config.yml.

### README.md

The readme in each directory contains an explanation of what the workshop is about. If an additional summary property is provided in the config.yml that will be used in the overview section of the plugin.

### config.yml

This config file contains metadata describing some properties of your workshop, for example

```
---
id: someid
name: my workshop name
summary: something about this workshop
level: 4
tags:
  - solidity
  - beginner
```

Level: a level of difficulty indicator ( 1 - 5 )

Tags: an array of tags

id: this is used by the system to let REMIX call startTutorial(repo,branch,id). See below for more instructions.

### Steps

Each workshop contains what we call steps.
Each step is a directory containing:

- a readme describing the step, what to do.
- sol files:
  - these can be sol files and test sol files. The test files should be named yoursolname_test.sol
  - ANSWER files: these are named yoursolname_answer.sol and can be used to show the solution or the correct answer. The plugin will load the
    file in the IDE when a user clicks on 'Show Answer'
- js files
- vyper files

## Functions to call the plugin from the IDE

### Add a repository:

```
addRepository(repoName, branch)
```

### Start a tutorial

```
startTutorial(repoName,branch,id)
```

You don't need to add a separate addRepository before calling startTutorial, this call will also add the repo.

_Parameters_

id: this can be two things:

- type of number, it specifies the n-th tutorial in the list
- type of string, this refers to the ID parameter in the config.yml file in the tutorial
  for example:

```
---
id: basics
name: 1 Basics of Solidity
summary: Some basic functions explained
level: 4
tags:
    - solidity
```

### How to call these functions in the REMIX IDE

```
(function ()  {
try {
    // You don't need to add a separate addRepository before calling startTutorial, this is just an example
    remix.call('LearnEth', 'addRepository', "remix-project-org/remix-workshops", "master")
    remix.call('LearnEth', 'startTutorial', "remix-project-org/remix-workshops", "master", "basics")
    remix.call('LearnEth', 'startTutorial', "remix-project-org/remix-workshops", "master", 2)
} catch (e) {
   console.log(e.message)
}
})()
```

Then call this in the REMIX console

```
remix.exeCurrent()
```
