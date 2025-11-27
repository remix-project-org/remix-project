'use strict'
import tape from 'tape'
import { TraceManager } from '../src/trace/traceManager'
import { CodeManager } from '../src/code/codeManager'
const web3Test = require('./resources/testWeb3.ts')
const sourceMapping = require('./resources/sourceMapping')
import { SourceLocationTracker } from '../src/source/sourceLocationTracker'
const compiler = require('solc')
import { compilerInput } from './helpers/compilerHelper'

tape('SourceLocationTracker', function (t) {
  t.test('SourceLocationTracker.getSourceLocationFromVMTraceIndex - simple contract', async function (st) {

    const traceManager = new TraceManager({ web3: web3Test })
    const codeManager = new CodeManager(traceManager)

    let output = compiler.compile(compilerInput(contracts))
    output = JSON.parse(output)

    codeManager.codeResolver.cacheExecutingCode('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', '0x' + output.contracts['test.sol']['test'].evm.deployedBytecode.object)

    const tx = web3Test.getTransaction('0x20ef65b8b186ca942fcccd634f37074dde49b541c27994fc7596740ef44cfd52')

    traceManager.resolveTrace(tx).then(async () => {

      const sourceLocationTracker = new SourceLocationTracker(codeManager, { debugWithGeneratedSources: false })

      try {
        const map = await sourceLocationTracker.getSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 0, output.contracts)
        st.equal(map['file'], 0)
        st.equal(map['start'], 0)
      } catch (e) {
        console.log(e)
      }
      st.end()

    }).catch((e) => {
      t.fail(' - traceManager.resolveTrace - failed ')
      console.error(e)
    })
  })

  t.test('SourceLocationTracker.getSourceLocationFromVMTraceIndex - ABIEncoder V2 contract', async function (st) {

    const traceManager = new TraceManager({ web3: web3Test })
    const codeManager = new CodeManager(traceManager)

    let output = compiler.compile(compilerInput(ABIEncoderV2))
    output = JSON.parse(output)

    codeManager.codeResolver.cacheExecutingCode('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', '0x' + output.contracts['test.sol']['test'].evm.deployedBytecode.object)

    const tx = web3Test.getTransaction('0x20ef65b8b186ca942fcccd634f37074dde49b541c27994fc7596740ef44cfd53')

    traceManager.resolveTrace(tx).then(async () => {

      try {
        // with debugWithGeneratedSources: false
        const sourceLocationTracker = new SourceLocationTracker(codeManager, { debugWithGeneratedSources: false })

        let map = await sourceLocationTracker.getSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 0, output.contracts)
        console.log(map)
        st.equal(map['file'], 0)
        st.equal(map['start'], 35)

        map = await sourceLocationTracker.getSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 45, output.contracts)
        st.equal(map['file'], 1) // 1 refers to the generated source (pragma experimental ABIEncoderV2)

        map = await sourceLocationTracker.getValidSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 30, output.contracts)
        st.equal(map['file'], 0) // 1 refers to the generated source (pragma experimental ABIEncoderV2)
        st.equal(map['start'], 303)
        st.equal(map['length'], 448)

        map = await sourceLocationTracker.getValidSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 26, output.contracts)
        st.equal(map['file'], 0) // 0 refers to the initial solidity code. see source below (ABIEncoderV2)
        st.equal(map['start'], 303)
        st.equal(map['length'], 448)
      } catch (e) {
        console.log(e)
      }

      try {
        // with debugWithGeneratedSources: true
        const sourceLocationTracker = new SourceLocationTracker(codeManager, { debugWithGeneratedSources: true })

        let map = await sourceLocationTracker.getSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 0, output.contracts)
        console.log(map)
        st.equal(map['file'], 0)
        st.equal(map['start'], 35)

        map = await sourceLocationTracker.getSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 45, output.contracts)
        st.equal(map['file'], 1) // 1 refers to the generated source (pragma experimental ABIEncoderV2)

        map = await sourceLocationTracker.getValidSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 45, output.contracts)
        st.equal(map['file'], 1) // 1 refers to the generated source (pragma experimental ABIEncoderV2)
        st.equal(map['start'], 2085)
        st.equal(map['length'], 139)

        map = await sourceLocationTracker.getValidSourceLocationFromVMTraceIndex('0x0d3a18d64dfe4f927832ab58d6451cecc4e517c5', 36, output.contracts)
        st.equal(map['file'], 0) // 0 refers to the initial solidity code. see source below (ABIEncoderV2)
        st.equal(map['start'], 303)
        st.equal(map['length'], 448)
      } catch (e) {
        console.log(e)
      }
      st.end()

    }).catch(() => {
      t.fail(' - traceManager.resolveTrace - failed ')
    })
  })
})

const contracts = `contract test {
    function f1() public returns (uint) {
        uint t = 4;
        return t;
    }
    
    function f2() public {
        
    }
}
`

const ABIEncoderV2 = `pragma experimental ABIEncoderV2;

contract test {
    // 000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000015b38da6a701c568545dcfcb03fcb875f56beddc4
    // 0000000000000000000000000000000000000000000000000000000000000002
    function testg (bytes calldata userData) external returns (bytes memory, bytes32, bytes32, uint) {
        bytes32 idAsk = abi.decode(userData[:33], (bytes32));
        bytes32 idOffer = abi.decode(userData[32:64], (bytes32));
        // bytes4 sellerAddress = abi.decode(userData[:4], (bytes4));       
        bytes memory ro  = abi.encodePacked(msg.sender, msg.sender, idAsk, idOffer);
        return (ro, idAsk, idOffer, userData.length);
    }
    
    
    function testgp (bytes calldata userData) external returns (bytes4) {
        return  abi.decode(userData[:4], (bytes4));
    }
}
`
