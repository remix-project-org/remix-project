const fs = require('fs')

let value = fs.readFileSync('./done.json')
value = JSON.parse(value)
const {nodes} = value.data.organization.projectV2.items
let data = ''
console.log(nodes.length, 'PRs\n')
data = nodes.length + ' PRs\n'
for (let node of nodes) {
  if (node.content.url && node.content.merged && node.content.merged !== false) {
    data += `${node.content.title} - ${node.content.url}\n`
  }
}

fs.writeFileSync('./done.txt', data)
console.log('done.txt updated')

/*
 - Login to Github CLI: gh auth login
 - set the correct project id
 - run the query (be careful, this only returns the first 100 elements)
 - Copy the JSON content from CLI in done.json
 - run this script
 - get the result from the file done.txt
/*

gh api graphql -f query='{
  organization(login: "remix-project-org") {
    projectV2(number: 31) {
      title
      url
      items(first: 100) {
        totalCount
        nodes {
          content {
            ... on PullRequest {
              url
              id
              number
              title
              merged
            }
          }
        }
      }
    }
  }
}'
*/
