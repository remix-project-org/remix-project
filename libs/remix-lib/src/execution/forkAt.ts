'use strict'

/**
  * returns the fork name for the @argument networkId and @argument blockNumber
  *
  * @param {number} networkId - network Id (1 for VM, 3 for Ropsten, 4 for Rinkeby, 5 for Goerli)
  * @param {number} blockNumber - block number
  * @return {String} - fork name (Berlin, Istanbul, ...)
  */
export function forkAt (networkId, blockNumber) {
  if (forks[networkId]) {
    let currentForkName = forks[networkId][0].name
    for (const fork of forks[networkId]) {
      if (blockNumber >= fork.number) {
        currentForkName = fork.name
      }
    }
    return currentForkName
  }
  return 'london'
}

// see https://github.com/ethereum/go-ethereum/blob/master/params/config.go
const forks = {
  1: [
    {
      number: 4370000,
      name: 'byzantium'
    },
    {
      number: 7280000,
      name: 'constantinople'
    },
    {
      number: 7280000,
      name: 'petersburg'
    },
    {
      number: 9069000,
      name: 'istanbul'
    },
    {
      number: 9200000,
      name: 'muirglacier'
    },
    {
      number: 12244000,
      name: 'berlin'
    },
    {
      number: 12965000,
      name: 'london'
    },
    {
      number: 13773000,
      name: 'arrowGlacier'
    },
    {
      number: 15050000,
      name: 'grayGlacier'
    },
    {
      number: 15537394,
      name: 'paris'
    },
    {
      number: 17034870,
      name: 'shanghai'
    },
    {
      number: 19426587,
      name: 'cancun'
    },
    {
      number: 19426587,
      name: 'prague'
    }
  ],
  3: [
    {
      number: 1700000,
      name: 'byzantium'
    },
    {
      number: 4230000,
      name: 'constantinople'
    },
    {
      number: 4939394,
      name: 'petersburg'
    },
    {
      number: 6485846,
      name: 'istanbul'
    },
    {
      number: 7117117,
      name: 'muirglacier'
    },
    {
      number: 9812189,
      name: 'berlin'
    },
    {
      number: 10499401,
      name: 'london'
    }
  ],
  4: [
    {
      number: 1035301,
      name: 'byzantium'
    },
    {
      number: 3660663,
      name: 'constantinople'
    },
    {
      number: 4321234,
      name: 'petersburg'
    },
    {
      number: 5435345,
      name: 'istanbul'
    },
    {
      number: 8290928,
      name: 'berlin'
    },
    {
      number: 8897988,
      name: 'london'
    }
  ],
  5: [
    {
      number: 1561651,
      name: 'istanbul'
    },
    {
      number: 4460644,
      name: 'berlin'
    },
    {
      number: 5062605,
      name: 'london'
    }
  ]
}
