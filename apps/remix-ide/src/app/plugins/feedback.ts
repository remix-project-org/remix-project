import { Plugin } from '@remixproject/engine'
import { ApiClient } from '@remix-api'
import { endpointUrls } from '@remix-endpoints-helper'

export interface FeedbackForm {
  id: number
  title: string
  url: string
  description: string
  priority: number
  starts_at: string | null
  expires_at: string | null
  created_at: string
}

interface FeedbackResponse {
  forms: FeedbackForm[]
  count: number
}

const profile = {
  name: 'feedback',
  displayName: 'Feedback',
  description: 'Fetches and manages feedback forms for the authenticated user',
  methods: ['getFeedbackForm', 'fetchFeedbackForms'],
  events: ['feedbackFormChanged']
}

export class FeedbackPlugin extends Plugin {
  private apiClient: ApiClient
  private currentForm: FeedbackForm | null = null

  constructor() {
    super(profile)
    this.apiClient = new ApiClient(endpointUrls.feedback)
  }

  async onActivation(): Promise<void> {
    // Listen for auth state changes to refetch feedback forms
    this.on('auth', 'authStateChanged', async (authState: any) => {
      if (authState.isAuthenticated && authState.token) {
        this.apiClient.setToken(authState.token)
        await this.fetchFeedbackForms()
      } else {
        this.currentForm = null
        this.emit('feedbackFormChanged', null)
      }
    })

    // Try to initialize with existing token
    try {
      const token = localStorage.getItem('remix_access_token')
      if (token) {
        this.apiClient.setToken(token)
        // Set up token refresh via auth plugin
        this.apiClient.setTokenRefreshCallback(async () => {
          try {
            const newToken = await this.call('auth', 'getToken')
            return newToken
          } catch {
            return null
          }
        })
        await this.fetchFeedbackForms()
      }
    } catch (e) {
      console.debug('[FeedbackPlugin] Initial fetch skipped:', e)
    }
  }

  /**
   * Fetch feedback forms from the API and store the highest priority one
   */
  async fetchFeedbackForms(): Promise<FeedbackForm | null> {
    try {
      const response = await this.apiClient.get<FeedbackResponse>('')
      if (response.ok && response.data && response.data.count > 0) {
        // API returns forms sorted by priority desc — take the first one
        this.currentForm = response.data.forms[0]
      } else {
        this.currentForm = null
      }
    } catch (e) {
      console.debug('[FeedbackPlugin] Failed to fetch feedback forms:', e)
      this.currentForm = null
    }

    this.emit('feedbackFormChanged', this.currentForm)
    return this.currentForm
  }

  /**
   * Get the current highest-priority feedback form (if any)
   */
  async getFeedbackForm(): Promise<FeedbackForm | null> {
    return this.currentForm
  }
}
