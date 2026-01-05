import React, { useState, useEffect } from 'react'
import { endpointUrls } from '@remix-endpoints-helper'

interface Credits {
  balance: number
  free_credits: number
  paid_credits: number
}

interface Transaction {
  id: number
  amount: number
  type: 'free_grant' | 'purchase' | 'usage' | 'refund'
  reason?: string
  metadata?: any
  created_at: string
}

interface CreditsBalanceProps {
  plugin: any
}

export const CreditsBalance: React.FC<CreditsBalanceProps> = ({ plugin }) => {
  const [credits, setCredits] = useState<Credits | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [enableLogin, setEnableLogin] = useState<boolean>(false)

  const loadCredits = async () => {
    try {
      const token = localStorage.getItem('remix_access_token')
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${endpointUrls.credits}/balance`, {
        credentials: 'include',
        headers
      })

      if (response.status === 401) {
        setCredits(null)
        return
      }

      if (response.ok) {
        const data = await response.json()
        setCredits(data)
      }
    } catch (err) {
      console.error('Error loading credits:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadTransactions = async () => {
    try {
      const token = localStorage.getItem('remix_access_token')
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${endpointUrls.credits}/transactions`, {
        credentials: 'include',
        headers
      })

      if (response.status === 401) {
        setTransactions([])
        return
      }

      if (response.ok) {
        const data = await response.json()
        setTransactions(data.transactions || [])
      }
    } catch (err) {
      console.error('Error loading transactions:', err)
    }
  }

  useEffect(() => {
    const checkLoginEnabled = () => {
      const enabled = localStorage.getItem('enableLogin') === 'true'
      setEnableLogin(enabled)
    }
    checkLoginEnabled()

    const loadData = async () => {
      await loadCredits()
      await loadTransactions()
    }

    loadData()

    const onAuthStateChanged = async (_payload: any) => {
      await loadData()
      checkLoginEnabled()
    }

    try {
      plugin.on('auth', 'authStateChanged', onAuthStateChanged)
    } catch (e) {
      // noop
    }

    return () => {
      try {
        plugin.off('auth', 'authStateChanged')
      } catch (e) {
        // ignore
      }
    }
  }, [])

  if (!enableLogin) {
    return null
  }

  if (loading) {
    return (
      <div className="p-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="sr-only">Loading...</span>
        </div>
        <span className="ml-2">Loading credits...</span>
      </div>
    )
  }

  if (!credits) {
    return null
  }

  return (
    <div>
      <div className="mb-2">
        <div className="row">
          <div className="col-md-4 mb-2">
            <div className="text-center p-3 bg-light rounded">
              <div className="h4 mb-0 font-weight-bold text-primary">{credits.balance.toLocaleString()}</div>
              <small className="text-muted">Total Credits</small>
            </div>
          </div>
          <div className="col-md-4 mb-2">
            <div className="text-center p-3 bg-light rounded">
              <div className="h4 mb-0 text-success">{credits.free_credits.toLocaleString()}</div>
              <small className="text-muted">Free Credits</small>
            </div>
          </div>
          <div className="col-md-4 mb-2">
            <div className="text-center p-3 bg-light rounded">
              <div className="h4 mb-0 text-info">{credits.paid_credits.toLocaleString()}</div>
              <small className="text-muted">Paid Credits</small>
            </div>
          </div>
        </div>
        <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>
          <i className="fas fa-info-circle me-1"></i>
          Credits are shared across all your linked accounts
        </p>
      </div>

      {transactions && transactions.length > 0 && (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="font-weight-bold mb-0">
              <i className="fas fa-history mr-2"></i>
              Recent Transactions
            </h6>
            {transactions.length > 5 && (
              <button
                className="btn btn-sm btn-link"
                onClick={() => setShowAllTransactions(!showAllTransactions)}
              >
                {showAllTransactions ? 'Show Less' : `Show All (${transactions.length})`}
              </button>
            )}
          </div>
          <div className="list-group" style={{ maxHeight: showAllTransactions ? 'none' : '300px', overflowY: 'auto' }}>
            {(showAllTransactions ? transactions : transactions.slice(0, 5)).map((tx) => (
              <div key={tx.id} className="list-group-item">
                <div className="d-flex justify-content-between align-items-start">
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center mb-1">
                      <span className={`badge ${tx.amount > 0 ? 'badge-success' : 'badge-danger'} mr-2`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </span>
                      <span className="font-weight-bold">{tx.reason || tx.type}</span>
                    </div>
                    <div className="small text-muted">
                      {new Date(tx.created_at).toLocaleString()}
                    </div>
                    {tx.metadata && (
                      <div className="small text-muted mt-1">
                        {typeof tx.metadata === 'string' ? tx.metadata : JSON.stringify(tx.metadata)}
                      </div>
                    )}
                  </div>
                  <span className={`badge badge-${tx.type === 'free_grant' ? 'success' : tx.type === 'usage' ? 'warning' : 'info'}`}>
                    {tx.type.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
