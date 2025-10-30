import axios from 'axios'
import { toast } from 'react-toastify'
import groupBy from 'lodash/groupBy'
import pick from 'lodash/pick'
import { type ModelType } from '../store'
import { router } from '../../App'
import { trackMatomoEvent } from '@remix-api'
import remixClient from '../../remix-client'

// const apiUrl = 'http://localhost:3001';
const apiUrl = 'https://learneth.api.remix.live'

export const repoMap = {
  en: {
    name: 'remix-project-org/remix-workshops',
    branch: 'master',
  },
  zh: {
    name: 'remix-project-org/remix-workshops',
    branch: 'zh',
  },
  es: {
    name: 'remix-project-org/remix-workshops',
    branch: 'es',
  },
}

// This data simulates the API response and includes 'priority'
const mockApiData = {
  ids: [
    'basics', 'circom-hash-checker', 'er721Auction', 'test-no-priority-Z',
    'test-same-priority-A', 'test-no-priority-A', 'advanced-prio-1',
    'advanced-no-prio-B', 'advanced-prio-2', 'advanced-no-prio-A'
  ],
  entities: {
    // --- LEVEL 1 (Beginner) ---
    // Prio: 100
    'basics': {
      id: 'basics',
      level: 1,
      name: 'L1 - Basics of Remix (Prio 100)',
      description: { content: 'Should be 1st in Level 1.' },
      metadata: { data: { id: 'basics', level: 1, name: 'L1 - Basics of Remix (Prio 100)', tags: ['Remix'], priority: 100 } },
      steps: []
    },
    // Prio: 200
    'test-same-priority-A': {
      id: 'test-same-priority-A',
      level: 1,
      name: 'L1 - AAA Same Priority (Prio 200)',
      description: { content: 'Should be 2nd in Level 1 (Same prio as Hash Checker, but name "AAA" comes first).' },
      metadata: { data: { id: 'test-same-priority-A', level: 1, name: 'L1 - AAA Same Priority (Prio 200)', tags: ['Test'], priority: 200 } },
      steps: []
    },
    // Prio: 200
    'circom-hash-checker': {
      id: 'circom-hash-checker',
      level: 1,
      name: 'L1 - Hash Checker Tutorial (Prio 200)',
      description: { content: 'Should be 3rd in Level 1 (Same prio as "AAA", but "Hash" comes after).' },
      metadata: { data: { id: 'circom-hash-checker', level: 1, name: 'L1 - Hash Checker Tutorial (Prio 200)', tags: ['Circom', 'Remix-IDE'], priority: 200 } },
      steps: []
    },
    // No Prio
    'test-no-priority-A': {
      id: 'test-no-priority-A',
      level: 1,
      name: 'L1 - Alpha No Priority (No Prio)',
      description: { content: 'Should be 4th in Level 1 (Comes after all prioritized items. "Alpha" comes before "Zeta").' },
      metadata: { data: { id: 'test-no-priority-A', level: 1, name: 'L1 - Alpha No Priority (No Prio)', tags: ['Test']} }, // no priority
      steps: []
    },
    // No Prio
    'test-no-priority-Z': {
      id: 'test-no-priority-Z',
      level: 1,
      name: 'L1 - Zeta No Priority (No Prio)',
      description: { content: 'Should be 5th (Last) in Level 1 (Comes after all prioritized items. "Zeta" comes after "Alpha").' },
      metadata: { data: { id: 'test-no-priority-Z', level: 1, name: 'L1 - Zeta No Priority (No Prio)', tags: ['Test']} }, // no priority
      steps: []
    },

    // --- LEVEL 2 (Intermediate) ---
    // Prio: 100
    'er721Auction': {
      id: 'er721Auction',
      level: 2,
      name: 'L2 - NFT Auction Contract (Prio 100)',
      description: { content: 'Should be 1st in Level 2.' },
      metadata: { data: { id: 'er721Auction', level: 2, name: 'L2 - NFT Auction Contract (Prio 100)', tags: ['Solidity', 'NFT'], priority: 100 } },
      steps: []
    },

    // --- LEVEL 3 (Advanced) ---
    // Prio: 100
    'advanced-prio-1': {
      id: 'advanced-prio-1',
      level: 3,
      name: 'L3 - Advanced Topic 1 (Prio 100)',
      description: { content: 'Should be 1st in Level 3.' },
      metadata: { data: { id: 'advanced-prio-1', level: 3, name: 'L3 - Advanced Topic 1 (Prio 100)', tags: ['Advanced'], priority: 100 } },
      steps: []
    },
    // Prio: 300
    'advanced-prio-2': {
      id: 'advanced-prio-2',
      level: 3,
      name: 'L3 - Advanced Topic 2 (Prio 300)',
      description: { content: 'Should be 2nd in Level 3.' },
      metadata: { data: { id: 'advanced-prio-2', level: 3, name: 'L3 - Advanced Topic 2 (Prio 300)', tags: ['Advanced'], priority: 300 } },
      steps: []
    },
    // No Prio
    'advanced-no-prio-A': {
      id: 'advanced-no-prio-A',
      level: 3,
      name: 'L3 - Adv Topic A (No Prio)',
      description: { content: 'Should be 3rd in Level 3 (After prioritized items. "A" comes before "B").' },
      metadata: { data: { id: 'advanced-no-prio-A', level: 3, name: 'L3 - Adv Topic A (No Prio)', tags: ['Advanced']} }, // no priority
      steps: []
    },
    // No Prio
    'advanced-no-prio-B': {
      id: 'advanced-no-prio-B',
      level: 3,
      name: 'L3 - Adv Topic B (No Prio)',
      description: { content: 'Should be 4th (Last) in Level 3 (After prioritized items. "B" comes after "A").' },
      metadata: { data: { id: 'advanced-no-prio-B', level: 3, name: 'L3 - Adv Topic B (No Prio)', tags: ['Advanced']} }, // no priority
      steps: []
    }
  }
}

const Model: ModelType = {
  namespace: 'workshop',
  state: {
    list: Object.keys(repoMap).map(item => repoMap[item]),
    detail: {},
    selectedId: '',
  },
  reducers: {
    save(state, { payload }) {
      return { ...state, ...payload }
    },
  },
  effects: {
    *loadRepo({ payload }, { put, select }) {
      yield router.navigate('/home')

      toast.warn('USING MOCK DATA FOR TESTING', { autoClose: 3000 })

      yield put({
        type: 'loading/save',
        payload: {
          screen: true,
        },
      })

      const { list, detail } = yield select((state) => state.workshop)

      // Inject mock data
      const data = mockApiData

      const repoId = `${payload.name}-${payload.branch}`

      for (let i = 0; i < data.ids.length; i++) {
        const {
          steps,
          metadata: {
            data: { steps: metadataSteps },
          },
        } = data.entities[data.ids[i]]

        let newSteps = []

        if (metadataSteps) {
          newSteps = metadataSteps.map((step: any) => {
            return {
              ...steps.find((item: any) => item.name === step.path),
              name: step.name,
            }
          })
        } else {
          newSteps = steps.map((step: any) => ({
            ...step,
            name: step.name.replace('_', ' '),
          }))
        }

        const stepKeysWithFile = ['markdown', 'solidity', 'test', 'answer', 'js', 'vy']

        for (let j = 0; j < newSteps.length; j++) {
          const step = newSteps[j]
          for (let k = 0; k < stepKeysWithFile.length; k++) {
            const key = stepKeysWithFile[k]
            if (step[key]) {
              try {
                step[key].content = null // we load this later
              } catch (error) {
                console.error(error)
              }
            }
          }
        }
        data.entities[data.ids[i]].steps = newSteps
      }

      const workshopState = {
        detail: {
          ...detail,
          [repoId]: {
            ...data,
            group: groupBy(
              data.ids.map((id: string) => pick(data.entities[id], ['level', 'id'])),
              (item: any) => item.level
            ),
            ...payload,
          },
        },
        list: list.map(item => `${item.name}/${item.branch}`).includes(`${payload.name}/${payload.branch}`) ? list : [...list, payload],
        selectedId: repoId,
      }
      yield put({
        type: 'workshop/save',
        payload: workshopState,
      })

      toast.dismiss()
      yield put({
        type: 'loading/save',
        payload: {
          screen: false,
        },
      })

      if (payload.id) {
        const { detail, selectedId } = workshopState
        const { ids, entities } = detail[selectedId]
        for (let i = 0; i < ids.length; i++) {
          const entity = entities[ids[i]]
          if (entity.metadata.data.id === payload.id || i + 1 === payload.id) {
            yield router.navigate(`/list?id=${ids[i]}`)
            break
          }
        }
      }
      // we don't need to track the default repos
      if (payload.name !== 'ethereum/remix-workshops' && payload.name !== 'remix-project-org/remix-workshops') {
        trackMatomoEvent(remixClient, { category: 'learneth', action: 'load_repo', name: payload.name, isClick: false })
      }
    },
    // *loadRepo({ payload }, { put, select }) {
    //   yield router.navigate('/home')

    //   toast.info(`loading ${payload.name}/${payload.branch}`)

    //   yield put({
    //     type: 'loading/save',
    //     payload: {
    //       screen: true,
    //     },
    //   })

    //   const { list, detail } = yield select((state) => state.workshop)

    //   const url = `${apiUrl}/clone/${encodeURIComponent(payload.name)}/${payload.branch}?${Math.random()}`

    //   let data
    //   try {
    //     const response = yield axios.get(url)
    //     data = response.data
    //   } catch (error) {
    //     console.error('Failed to load workshop:', error)

    //     // Dismiss loading toast and show error
    //     toast.dismiss()

    //     // Extract detailed error message from response
    //     let errorMessage = 'Failed to load workshop'
    //     if (error.response?.data) {
    //       // If the response contains plain text error details (like in the screenshot)
    //       if (typeof error.response.data === 'string') {
    //         errorMessage = error.response.data
    //       }
    //       // If the response has a structured error message
    //       else if (error.response.data.message) {
    //         errorMessage = error.response.data.message
    //       }
    //       // If the response has error details
    //       else if (error.response.data.error) {
    //         errorMessage = error.response.data.error
    //       }
    //     }
    //     // Fallback to axios error message or generic error
    //     else if (error.message) {
    //       errorMessage = error.message
    //     } else {
    //       errorMessage = 'Network error occurred'
    //     }

    //     toast.error(errorMessage)

    //     // Clean up loading state
    //     yield put({
    //       type: 'loading/save',
    //       payload: {
    //         screen: false,
    //       },
    //     })

    //     // Track error event
    //     trackMatomoEvent(remixClient, { category: 'learneth', action: 'load_repo_error', name: `${payload.name}/${payload.branch}`, isClick: false })

    //     return // Exit early on error
    //   }

    //   const repoId = `${payload.name}-${payload.branch}`

    //   for (let i = 0; i < data.ids.length; i++) {
    //     const {
    //       steps,
    //       metadata: {
    //         data: { steps: metadataSteps },
    //       },
    //     } = data.entities[data.ids[i]]

    //     let newSteps = []

    //     if (metadataSteps) {
    //       newSteps = metadataSteps.map((step: any) => {
    //         return {
    //           ...steps.find((item: any) => item.name === step.path),
    //           name: step.name,
    //         }
    //       })
    //     } else {
    //       newSteps = steps.map((step: any) => ({
    //         ...step,
    //         name: step.name.replace('_', ' '),
    //       }))
    //     }

    //     const stepKeysWithFile = ['markdown', 'solidity', 'test', 'answer', 'js', 'vy']

    //     for (let j = 0; j < newSteps.length; j++) {
    //       const step = newSteps[j]
    //       for (let k = 0; k < stepKeysWithFile.length; k++) {
    //         const key = stepKeysWithFile[k]
    //         if (step[key]) {
    //           try {
    //             step[key].content = null // we load this later
    //           } catch (error) {
    //             console.error(error)
    //           }
    //         }
    //       }
    //     }
    //     data.entities[data.ids[i]].steps = newSteps
    //   }

    //   const workshopState = {
    //     detail: {
    //       ...detail,
    //       [repoId]: {
    //         ...data,
    //         group: groupBy(
    //           data.ids.map((id: string) => pick(data.entities[id], ['level', 'id'])),
    //           (item: any) => item.level
    //         ),
    //         ...payload,
    //       },
    //     },
    //     list: list.map(item => `${item.name}/${item.branch}`).includes(`${payload.name}/${payload.branch}`) ? list : [...list, payload],
    //     selectedId: repoId,
    //   }
    //   yield put({
    //     type: 'workshop/save',
    //     payload: workshopState,
    //   })

    //   toast.dismiss()
    //   yield put({
    //     type: 'loading/save',
    //     payload: {
    //       screen: false,
    //     },
    //   })

    //   if (payload.id) {
    //     const { detail, selectedId } = workshopState
    //     const { ids, entities } = detail[selectedId]
    //     for (let i = 0; i < ids.length; i++) {
    //       const entity = entities[ids[i]]
    //       if (entity.metadata.data.id === payload.id || i + 1 === payload.id) {
    //         yield router.navigate(`/list?id=${ids[i]}`)
    //         break
    //       }
    //     }
    //   }
    //   // we don't need to track the default repos
    //   if (payload.name !== 'ethereum/remix-workshops' && payload.name !== 'remix-project-org/remix-workshops') {
    //     trackMatomoEvent(remixClient, { category: 'learneth', action: 'load_repo', name: payload.name, isClick: false })
    //   }
    // },
    *resetAll({ payload }, { put }) {
      yield put({
        type: 'workshop/save',
        payload: {
          list: Object.keys(repoMap).map(item => repoMap[item]),
          detail: {},
          selectedId: '',
        },
      })

      yield put({
        type: 'workshop/loadRepo',
        payload: repoMap[payload.code]
      });
      trackMatomoEvent(remixClient, { category: 'learneth', action: 'reset_all', isClick: true })
    },
  },
}

export default Model
