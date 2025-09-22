
cd /tmp/
rm -rf git/bare.git
rm -rf git/bare2.git
rm -rf git
mkdir -p git
cd git
git config --global user.name "ci-bot"
git config --global user.email "ci-bot@remix-project.org"
git clone --bare https://github.com/remix-project-org/awesome-remix bare.git
git clone --bare https://github.com/remix-project-org/awesome-remix bare2.git
