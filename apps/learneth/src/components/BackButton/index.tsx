import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Dropdown } from 'react-bootstrap'
import remixClient from '../../remix-client'
import './index.scss'

function BackButton({ entity }: any) {
  const location = useLocation()
  const isDetailPage = location.pathname === '/detail'
  
  const queryParams = new URLSearchParams(location.search)
  const stepId = Number(queryParams.get('stepId'))
  const currentStep = entity?.steps?.[stepId]

  const tutorialId = entity?.id || queryParams.get('id')

  return (
    <div className="learneth-top-nav p-2">
      <div className="d-flex justify-content-between align-items-center">
        <Link 
          to="/home" 
          className="btn nav-button d-flex align-items-center"
          onClick={() => remixClient.clearCurrentTutorial()}
        >
          <i className="fas fa-chevron-left"></i>
          <span>Tutorials list</span>
        </Link>

        {isDetailPage && entity?.steps && (
          <Dropdown>
            <Dropdown.Toggle className="btn nav-button d-flex align-items-center" id="syllabus-dropdown">
              <i className="fas fa-list-ul me-2"></i>
              <span>Syllabus</span>
            </Dropdown.Toggle>

            <Dropdown.Menu className="syllabus-dropdown-menu">
              <div className="px-3 pt-2 pb-1 d-flex justify-content-between">
                <h6 className="fw-bold mb-0">Syllabus</h6>
                <span className="small text-muted">{entity.steps.length} chapters</span>
              </div>
              <Dropdown.Divider />
              {entity.steps.map((step: any, index: number) => (
                <Dropdown.Item as={Link} to={`/detail?id=${entity.id}&stepId=${index}`} key={index} className="syllabus-item">
                  <i className="far fa-file-alt me-2"></i>
                  <span>{step.name}</span>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        )}
      </div>

      {isDetailPage && currentStep && (
        <>
          <hr className="nav-divider my-2" />
          <div className="chapter-nav d-flex justify-content-between align-items-center">
            <Link 
              to={`/detail?id=${entity.id}&stepId=${stepId - 1}`} 
              className={`btn chapter-arrow ${stepId === 0 ? 'disabled' : ''}`}
            >
              <i className="fas fa-chevron-left"></i>
            </Link>

            <div className="text-center">
              <div className="chapter-title">{currentStep.name}</div>
              <div className="chapter-pagination small text-muted">
                {stepId + 1} / {entity.steps.length}
              </div>
            </div>

            <Link 
              to={`/detail?id=${entity.id}&stepId=${stepId + 1}`} 
              className={`btn chapter-arrow ${stepId >= entity.steps.length - 1 ? 'disabled' : ''}`}
            >
              <i className="fas fa-chevron-right"></i>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export default BackButton