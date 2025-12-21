const { spawnSync } = require('child_process')
const fs = require('fs')
const { exit } = require('process')
const file = fs.readFileSync('projects.json')
const projects = JSON.parse(file)
console.log(Object.keys(projects.graph.nodes))
for(let node of Object.keys(projects.graph.nodes)){
  if(projects.graph.nodes[node].data.targets.lint){
    console.log(projects.graph.nodes[node].data.name)
    const result = spawnSync('yarn', ['lint', projects.graph.nodes[node].data.name, '--fix'],)
    if(result.status == 0){
      console.log('success')
    }else{
      console.log(result.stdout.toString())
      console.log(result.stderr.toString())
      exit(1)
    }
  }
}