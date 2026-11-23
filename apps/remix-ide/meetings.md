# Team meeting 04/06/2019

## documentation

#### doc update for release

For each Remix Web3 PR, check whether the documentation needs to be updated.
If so, either 
    - update the doc with and link to the PR
    - create an issue with the label "documentation"

Before releasing (better a few days before), we take time to address documentation issues that *needs* to be done. @rob is committing to checking and organize our work on this.

#### monthly doc update

We setup a monthly call where we read through the documentation and check what should be added / updated / improved

#### move to Remix Web3

we move the documentation to the remix-ide repository

## medium post policy

Any post that relates to Ethereum could be put in the remix publication.
Although that is not mandatory and left up to the writer.

## guided tour

we still need to validate the framework but "shepherd" seems to be the one.

It will work as a native plugin, started by default.
Each other native plugin can request a guided tour with:
`this.call('guidedtour', 'start', 'debugger')`
Other type of plugin may be able to the native plugin guided tour but we won't push this if the integration is not working out of the box. 
We rather update the remix-plugin doc saying that `guided tour framework name` is the preferred one.

## website

we commit to have a public website for general info about us.
It won't be a branded website.
We are asking a designer for improving the Liana's logo.
We don't need to have a framework (hugo, hexo) if that's too much overhead.
@liana is testing out the easiest solution.

## solidity tutorial framework

it will be set of file:
 - md
 - solidity contract
 - test contract

we only support md for now and move to supporting other format if needed.
It requires the "test" native plugin to extend its API.
@rob/@francois are managing that.

## remix workshops repository

the current workshop should either be removed or converted to the md tutorial framework.
@rob/@francois are managing that


## coding best practices

Use html "id" only if needed.
"id" has to be explicit enough so the node can be targeted without using nested css target.

## file manager / file explorer / file provider

They are going to be refactored out to a stand alone ts repo / npm module

## npm module structure

will likely looks like:

RemixProject/component:
/Treeview
/tab
/tabs
/dialog
/fs
                      
RemixProject/libs:
/Solidity
/Tests
/FsProvider
                 
RemixProject/IDE

## browser test

a PR (https://github.com/ethereum/remix-ide/pull/1961) is waiting for merging @yann
It will be followed by other PRs, aiming to improve process of writing browser tests.

## desktop version

we will propose an offline version using electron (@yann)
first steps :
- put all the public link to the local package
- basic electron wrapper

## outreach beyond community

We agree it is something interesting to explore, 
It is not 100% dev tool nor remix so we should organize call with other people from EF at least
                      
