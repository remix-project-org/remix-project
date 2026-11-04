
import React, { useState, useEffect } from 'react'
import { Button, Form } from 'react-bootstrap'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'
import { CustomTooltip, Select } from "@remix-ui/helper"
import { trackMatomoEvent } from '@remix-api'
import remixClient from '../../remix-client'
import './index.css'

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
              <Select
                id="dropdown-custom-toggle"
                value=""
                placeholder="Select a repo"
                options={list.map((item: any) => ({
                  value: `${item.name}/${item.branch}`,
                  label: `${item.name}-${item.branch}`,
                  itemProps: { title: `${item.name}-${item.branch}` }
                }))}
                onChange={(value) => selectRepo(list.find((item: any) => `${item.name}/${item.branch}` === value))}
              />

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