
import React, { useState, useEffect, forwardRef, ReactNode } from 'react'
import { Button, Dropdown, Form } from 'react-bootstrap'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'
import { CustomTooltip } from "@remix-ui/helper"
import { trackMatomoEvent } from '@remix-api'
import remixClient from '../../remix-client'
import './index.css'

interface CustomToggleProps {
  children?: ReactNode
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

const CustomToggle = forwardRef<HTMLButtonElement, { children?: ReactNode, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }>(
  ({ children, onClick }, ref) => (
    <button
      ref={ref}
      onClick={(e) => { e.preventDefault(); onClick(e) }}
      className="btn btn-secondary d-flex justify-content-between align-items-center w-100"
    >
      <span>{children}</span>
      <i className="fas fa-caret-down"></i>
    </button>
  )
)
CustomToggle.displayName = 'CustomToggle'

const CustomMenu = forwardRef<HTMLDivElement, { children?: ReactNode, className?: string }>(
  ({ children, className }, ref) => {
    return (
      <div  
        ref={ref} 
        className={className} 
      >
        {children}
      </div>
    );
  }
);
CustomMenu.displayName = 'CustomMenu'

function RepoImporter({ list, selectedRepo }: any): JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const dispatch = useAppDispatch()
  const localeCode = useAppSelector((state) => state.remixide.localeCode)

  useEffect(() => {
    if (selectedRepo?.name) {
      setName(selectedRepo.name)
      setBranch(selectedRepo.branch)
    }
  }, [selectedRepo])

  const panelChange = () => { setOpen(!open) }
  const selectRepo = (repo: { name: string; branch: string }) => {
    dispatch({ type: 'workshop/loadRepo', payload: repo });
    trackMatomoEvent(remixClient, { 
      category: 'learneth', 
      action: 'select_repo', 
      name: `${repo.name}/${repo.branch}`, 
      isClick: true 
    })
    setOpen(false)
  }

  const importRepo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    dispatch({ type: 'workshop/loadRepo', payload: { name, branch } });   
    trackMatomoEvent(remixClient, { 
      category: 'learneth', 
      action: 'import_repo', 
      name: `${name}/${branch}`, 
      isClick: true 
    })
    setOpen(false)
  }

  return (
    <>
      <div className="repo-importer-container px-3 pt-3">
        <button onClick={panelChange} className="btn btn-secondary d-flex align-items-center justify-content-center w-100 mb-3 ">
          <i className="fas fa-upload me-2"></i>
          <span>Import another tutorial repo</span>
        </button>

        {open && (
          <div>
            <h6 className="mb-2 panel-title">Tutorial import</h6>
            <div className="bg-light border rounded p-3">
              <Dropdown className="w-100">
                <Dropdown.Toggle as={CustomToggle} id="dropdown-custom-toggle">
                  Select a repo
                </Dropdown.Toggle>
                <Dropdown.Menu className="w-100">
                  {list.map((item: any) => (
                    <Dropdown.Item
                      key={`${item.name}/${item.branch}`}
                      onClick={() => {
                        selectRepo(item)
                      }}
                      title={`${item.name}-${item.branch}`}
                    >
                      {item.name}-{item.branch}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>

              <div className="d-flex align-items-center my-1">
                <hr className="w-100 hr-themed" />
                <span className="px-2 text-nowrap">or import</span>
                <hr className="w-100 hr-themed" />
              </div>
              <Form onSubmit={importRepo}>
                <Form.Group className="mb-3">
                  <Form.Label className="repo-label d-flex align-items-center" htmlFor="name">
                    REPO REFERENCE
                    <CustomTooltip placement="top" tooltipId="learnethQuestionIconTooltip" tooltipText='i.e. username/repository'>
                      <i className="fas fa-question-circle ms-1" />
                    </CustomTooltip>
                  </Form.Label>
                  <Form.Control
                    id="name" 
                    type="text"
                    className="form-control"
                    required
                    placeholder="username/repository"
                    onChange={(e) => setName(e.target.value)}
                    value={name}
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="repo-label" htmlFor="branch">
                    BRANCH
                  </Form.Label>
                  <Form.Control
                    id="branch"
                    type="text"
                    className="form-control"
                    required
                    placeholder="master" 
                    onChange={(e) => setBranch(e.target.value)}
                    value={branch}
                  />  
                </Form.Group>
                <button className="btn btn-primary w-100" type="submit" disabled={!name || !branch}>
                  Import tutorial repository
                </button> 
              </Form>
            </div>   
          </div> 
        )} 

      </div>
    </>
  )
}

export default RepoImporter