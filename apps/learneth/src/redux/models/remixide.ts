import { toast } from 'react-toastify'
import { type ModelType } from '../store'
import remixClient from '../../remix-client'
import { router } from '../../App'
import { trackMatomoEvent } from '@remix-api'

function getFilePath(file: string): string {
  const name = file.split('/')
  return name.length > 1 ? `${name[name.length - 1]}` : ''
}

const Model: ModelType = {
  namespace: 'remixide',
  state: {
    errors: [],
    success: false,
    errorLoadingFile: false,
    // theme: '',
    localeCode: 'en'
  },
  reducers: {
    save(state, { payload }) {
      return { ...state, ...payload }
    },
  },
  effects: {
    *connect(_, { put }) {
      toast.info('connecting to the REMIX IDE')

      yield put({
        type: 'loading/save',
        payload: {
          screen: true,
        },
      })

      yield remixClient.onload(() => {
        remixClient.call('manager', 'activatePlugin', 'solidityUnitTesting')
      })

      toast.dismiss()

      yield put({
        type: 'loading/save',
        payload: {
          screen: false,
        },
      });

      yield router.navigate('/home')
    },
    *displayFile({ payload: step }, { select, put }) {
      let content = ''
      let path = ''
      if (step.solidity?.file) {
        content = step.solidity.content
        path = getFilePath(step.solidity.file)
      }
      if (step.js?.file) {
        content = step.js.content
        path = getFilePath(step.js.file)
      }
      if (step.vy?.file) {
        content = step.vy.content
        path = getFilePath(step.vy.file)
      }

      if (!content) {
        return
      }

      trackMatomoEvent(remixClient, { category: 'learneth', action: 'displayFile', name: `${(step && step.name)}/${path}`, isClick: true })

      toast.info(`loading ${path} into IDE`)
      yield put({
        type: 'loading/save',
        payload: {
          screen: true,
        },
      })

      const { detail, selectedId } = yield select((state) => state.workshop)

      const workshop = detail[selectedId]

      path = `.learneth/${workshop.name}/${step.name}/${path}`
      try {
        const isExist = yield remixClient.call('fileManager', 'exists' as any, path)
        if (!isExist) {
          yield remixClient.call('fileManager', 'setFile', path, content)
        }
        yield remixClient.call('fileManager', 'switchFile', `${path}`)
        yield put({
          type: 'remixide/save',
          payload: { errorLoadingFile: false },
        })
        toast.dismiss()
      } catch (error) {
        trackMatomoEvent(remixClient, { category: 'learneth', action: 'displayFileError', name: error.message, isClick: false })
        toast.dismiss()
        toast.error('File could not be loaded. Please try again.')
        yield put({
          type: 'remixide/save',
          payload: { errorLoadingFile: true },
        })
      }
      yield put({
        type: 'loading/save',
        payload: {
          screen: false,
        },
      })
    },
    *testStep({ payload: step }, { select, put }) {
      yield put({
        type: 'loading/save',
        payload: {
          screen: true,
        },
      })

      try {
        yield put({
          type: 'remixide/save',
          payload: { success: false },
        })
        const { detail, selectedId } = yield select((state) => state.workshop)

        const workshop = detail[selectedId]

        let path: string
        if (step.solidity.file) {
          path = getFilePath(step.solidity.file)
          path = `.learneth/${workshop.name}/${step.name}/${path}`
          yield remixClient.call('fileManager', 'switchFile', `${path}`)
        }

        path = getFilePath(step.test.file)
        path = `.learneth/${workshop.name}/${step.name}/${path}`
        yield remixClient.call('fileManager', 'setFile', path, step.test.content)

        const result = yield remixClient.call('solidityUnitTesting', 'testFromPath', path)

        if (!result) {
          yield put({
            type: 'remixide/save',
            payload: { errors: ['Compiler failed to test this file']},
          });
          trackMatomoEvent(remixClient, { category: 'learneth', action: 'testStepError', name: 'Compiler failed to test this file', isClick: false })
        } else {
          const success = result.totalFailing === 0;
          if (success) {
            yield put({
              type: 'remixide/save',
              payload: { errors: [], success: true },
            })
          } else {
            yield put({
              type: 'remixide/save',
              payload: {
                errors: result.errors.map((error: {message: any}) => error.message),
              },
            })
          }
          trackMatomoEvent(remixClient, { category: 'learneth', action: 'testStep', name: String(success), isClick: true })
        }
      } catch (err) {
        yield put({
          type: 'remixide/save',
          payload: { errors: [String(err)]},
        });
        trackMatomoEvent(remixClient, { category: 'learneth', action: 'testStepError', name: String(err), isClick: false })
      }
      yield put({
        type: 'loading/save',
        payload: {
          screen: false,
        },
      })
    },
    *showAnswer({ payload: step }, { select, put }) {
      yield put({
        type: 'loading/save',
        payload: {
          screen: true,
        },
      })

      toast.info('loading answer into IDE')

      try {
        const content = step.answer.content
        let path = getFilePath(step.answer.file)

        const { detail, selectedId } = yield select((state) => state.workshop)

        const workshop = detail[selectedId]
        path = `.learneth/${workshop.name}/${step.name}/${path}`
        yield remixClient.call('fileManager', 'setFile', path, content)
        yield remixClient.call('fileManager', 'switchFile', `${path}`);

        trackMatomoEvent(remixClient, { category: 'learneth', action: 'showAnswer', name: path, isClick: true })
      } catch (err) {
        yield put({
          type: 'remixide/save',
          payload: { errors: [String(err)]},
        });
        trackMatomoEvent(remixClient, { category: 'learneth', action: 'showAnswerError', name: err.message, isClick: false })
      }

      toast.dismiss()
      yield put({
        type: 'loading/save',
        payload: {
          screen: false,
        },
      })
    },
    *testSolidityCompiler(_, { put, select }) {
      try {
        yield remixClient.call('solidity', 'getCompilationResult');
        trackMatomoEvent(remixClient, { category: 'learneth', action: 'testSolidityCompiler', isClick: true })
      } catch (err) {
        const errors = yield select((state) => state.remixide.errors)
        yield put({
          type: 'remixide/save',
          payload: {
            errors: [...errors, "The `Solidity Compiler` is not yet activated.<br>Please activate it using the `SOLIDITY` button in the `Featured Plugins` section of the homepage.<img class='img-thumbnail mt-3' src='assets/activatesolidity.png'>"],
          },
        });
        trackMatomoEvent(remixClient, { category: 'learneth', action: 'testSolidityCompilerError', name: err.message, isClick: false })
      }
    }
  },
}

export default Model
