import axios from 'axios'

// In-memory access token — never persisted to localStorage (XSS prevention).
// The httpOnly refresh_token cookie is managed by the backend.
let _accessToken: string | null = null

export const setAccessToken = (token: string | null) => {
  _accessToken = token
}

const client = axios.create({
  baseURL: '/api',
  withCredentials: true, // Required so the browser sends the httpOnly refresh_token cookie
})

// Attach Bearer token to every outgoing request
client.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`
  }
  return config
})

// On 401: attempt a single token refresh using the httpOnly cookie, then retry
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        // Use a raw axios call (bypasses interceptors) to avoid infinite loops
        const { data } = await axios.post<{ access: string }>(
          '/api/auth/token/refresh/',
          {},
          { withCredentials: true },
        )
        setAccessToken(data.access)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return client(originalRequest)
      } catch {
        setAccessToken(null)
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  },
)

export default client
