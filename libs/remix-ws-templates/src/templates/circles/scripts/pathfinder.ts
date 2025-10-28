import { CirclesRpc } from '@circles-sdk/data';

(window as any).ethereum = web3Provider

const chainConfig = {
  pathfinderUrl: 'https://pathfinder.aboutcircles.com',
  circlesRpcUrl: 'https://rpc.aboutcircles.com',
  v1HubAddress: '0xdbf22d4e8962db3b2f1d9ff55be728a887e47710',
  v2HubAddress: '0x2066CDA98F98397185483aaB26A89445addD6740',
  migrationAddress: '0x2A545B54bb456A0189EbC53ed7090BfFc4a6Af94'
};

const sourceAddress = ''
const targetAddress = ''
const value = '1000000000000000000'
/*
{"jsonrpc":"2.0","id":0,"method":"circlesV2_findPath","params":[{"Source":"0xf7f307601497eAD8217543Fc9B350Ae6DA5fB5eF","Sink":"0x3765c1633eA9dDaD819B1b7d9A27B1E117f789a2","TargetFlow":"1000000000000000000"}]}
*/
const run = async () => {
    try {
        const res = await new CirclesRpc(chainConfig.circlesRpcUrl).call<any>('circlesV2_findPath', [{
            Source: sourceAddress,
            Sink: targetAddress,
            TargetFlow: value
        }])
        console.log(res.result)
    } catch (e) {
        console.error(e)
    }    
}

run().catch(console.error).then(console.log)
