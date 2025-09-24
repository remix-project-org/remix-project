import React, { useEffect } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import LoadingScreen from './components/LoadingScreen'
import LogoPage from './pages/Logo'
import HomePage from './pages/Home'
import StepListPage from './pages/StepList'
import StepDetailPage from './pages/StepDetail'
import remixClient from './remix-client'
import { repoMap } from './redux/models/workshop'
import { useAppDispatch } from './redux/hooks'
import 'react-toastify/dist/ReactToastify.css'
import './App.css'

export const router = createHashRouter([
  {
    path: '/',
    element: <LogoPage />,
  },
  {
    path: '/home',
    element: <HomePage />,
  },
  {
    path: '/list',
    element: <StepListPage />,
  },
  {
    path: '/detail',
    element: <StepDetailPage />,
  },
])

function App(): JSX.Element {
  const dispatch = useAppDispatch()

  const loadRepo = (locale: any) => {
    dispatch({
      type: 'remixide/save',
      payload: { localeCode: locale.code },
    })
    dispatch({
      type: 'workshop/loadRepo',
      payload: repoMap[locale.code] || repoMap.en,
    })
  }

  useEffect(() => {
    dispatch({
      type: 'remixide/connect',
      callback: () => {
        // @ts-ignore
        remixClient.call('locale', 'currentLocale').then((locale: any) => {
          if (!(window as any).startTutorialCalled) {
            loadRepo(locale)
          }
        })
        // @ts-ignore
        remixClient.on('locale', 'localeChanged', (locale: any) => {
          loadRepo(locale)
        })
      }
    })
  }, [])

  return (
    <>
      <RouterProvider router={router} />
      <LoadingScreen />
      <ToastContainer position="bottom-right" newestOnTop closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover autoClose={false} theme="colored" />
    </>
  )
}

export default App
