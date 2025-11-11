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

      toast.info(`loading ${payload.name}/${payload.branch}`)

      yield put({
        type: 'loading/save',
        payload: {
          screen: true,
        },
      })

      const { list, detail } = yield select((state) => state.workshop)

      const url = `${apiUrl}/clone/${encodeURIComponent(payload.name)}/${payload.branch}?${Math.random()}`

      let data
      try {
        const response = yield axios.get(url)
        data = response.data
      } catch (error) {
        console.error('Failed to load workshop:', error)

        // Dismiss loading toast and show error
        toast.dismiss()

        // Extract detailed error message from response
        let errorMessage = 'Failed to load workshop'
        if (error.response?.data) {
          // If the response contains plain text error details (like in the screenshot)
          if (typeof error.response.data === 'string') {
            errorMessage = error.response.data
          }
          // If the response has a structured error message
          else if (error.response.data.message) {
            errorMessage = error.response.data.message
          }
          // If the response has error details
          else if (error.response.data.error) {
            errorMessage = error.response.data.error
          }
        }
        // Fallback to axios error message or generic error
        else if (error.message) {
          errorMessage = error.message
        } else {
          errorMessage = 'Network error occurred'
        }

        toast.error(errorMessage)

        // Clean up loading state
        yield put({
          type: 'loading/save',
          payload: {
            screen: false,
          },
        })

        // Track error event
        trackMatomoEvent(remixClient, { category: 'learneth', action: 'load_repo_error', name: `${payload.name}/${payload.branch}`, isClick: false })

        return // Exit early on error
      }

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
