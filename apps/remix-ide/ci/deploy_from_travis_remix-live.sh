#!/bin/bash

set -e
SHA=`git rev-parse --short --verify HEAD`

# this gh action is used to deploy the build to the gh pages
mkdir dist/apps/remix-ide/.github
mkdir dist/apps/remix-ide/.github/workflows
cp apps/remix-ide/ci/gh-actions-deploy.yml dist/apps/remix-ide/.github/workflows/gh-actions-deploy.yml

cd dist/apps/remix-ide

git init
git checkout -b gh-pages
git config user.name "$COMMIT_AUTHOR"
git config user.email "$COMMIT_AUTHOR_EMAIL"

echo "remix.ethereum.org" > CNAME

echo "# Automatic build" > README.md
echo "Built website from \`$SHA\`. See https://github.com/remix-project-org/remix-project/ for details." >> README.md
echo "To use an offline copy, download \`remix-$SHA.zip\`." >> README.md

zip -r remix-$SHA.zip .
git add .
git commit -m "Built website from {$SHA}."

git push -f git@github.com:remix-project-org/remix-live.git gh-pages
