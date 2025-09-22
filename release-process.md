# Release process 

## Feature Freeze
Once feature freeze is done, `remix_beta` should be updated to the latest `master` branch which will automatically update `beta.remix.live` through a CI job.

Use this unified command:

 - `yarn run updateBeta`

or individually:

 - `git checkout remix_beta`
 - `git pull origin remix_beta`
 - `git reset --hard <master-commit-hash>` (`master-commit-hash` will be latest commit id from `master` branch)
 - `git push -f origin remix_beta`
 
## Testing
Testing is performed after the Feature Freeze on `beta.remix.live`. `build-qa-doc.js` script can be used to generate the list of QA tasks. Instructions to use the file are given in the file itself: https://github.com/remix-project-org/remix-project/blob/master/build-qa-doc.js#L18 

Once ready to run, it can be run using the Node.js: `node build-qa-doc.js`

Ensure release highlights and release blog is updated in `remix-dynamics` repo's `beta` branch.

## Remix Project NPM packages publishing

Once testing is completed, release will start by publishing Remix NPM packages.

 - Make sure you are on `master` branch: `git checkout master`
 - Pull the latest: `git pull origin master`
 - Create a branch: `git checkout -b bumpLibsVersion`

### remixd NPM release

  `yarn run publish:remixd`

This command will ask for a new version.

### Other libraries NPM release

  `yarn run publish:libs`
 
This command uses `lerna` and is solely responsible for publishing all the remix libraries. It will ask for a new version of each library. Make sure you are logged in to NPM.

Once these commands run successfully, the version for each remix library will be updated to the latest in the libs' package.json file.

 - Create and merge bump PR to master
 
## Remix IDE Release

### Part 1. Bump the version and update Beta

#### Make sure `remix_beta` is up-to-date with `master` branch:

Use this unified command:

 - `yarn run updateBeta`

or individually:

 - `git checkout remix_beta`
 - `git pull origin remix_beta`
 - `git reset --hard <master-commit-hash>`
 - `git push -f origin remix_beta`

#### Create bump version PR:

 - Create a new branch from `remix_beta`: `git checkout -b bumpVersion`
 - Update package.json version. Usually, you need to remove `-dev` from the version string
 - Create a PR with base branch as `remix_beta`
 - Merge PR to **origin/remix_beta**

#### Create git tag from beta branch:

Use this unified command:

 - `yarn run publishTagfromBeta`

or individually:

 - `git checkout remix_beta`
 - `git pull origin remix_beta`
 - Create tag: `git tag v<version-number>`, `<version-number>` should be same as in package.json of `remix_beta` branch
 - Push tag: `git push --tags`

Publish a new release on GitHub using created tag and generate automated changelog by selecting the appropriate previous tag

### Part 2. Update the Remix Live

Updating the `remix_live` branch latest to the `remix_beta` runs the CircleCI build which updates live version of Remix IDE.

Use this unified command:

 - `yarn run updateLive`

or individually:

 - `git checkout remix_live`
 - `git pull origin remix_live`
 - `git reset --hard <remix_beta-commit-hash>` or `<master-commit-hash>` sometimes
 - `git push -f origin remix_live`

 CircleCI will update `https://github.com/remix-project-org/remix-live` and through `gh-pages`, remix live will be deployed on `remix.ethereum.org`

:point_right: Ensure release highlights, version and blog link are properly updated in `remix-dynamics` repo's `live` branch.
 
## Bump master branch 

 - `git checkout master`
 - `git pull origin master`
 - Create a new branch from `master`: `git checkout -b bumpDevVersion`
 - Bump the  package.json version, add the tag `-dev` if not already present.
 - Update new feature freeze date under `freeze-date` in `.github/workflows/pr-reminder.yml` file
 - Create and merge PR to `master`
 
## Remix IDE Alpha Release

`alpha.remix.live` is automatically updated every time a commit is pushed to `master` branch
