import { http, HttpResponse } from 'msw'
import { PORTFOLIO } from '../data/portfolio'

export const portfolioHandlers = [
  http.get('/api/portfolio/', () => {
    return HttpResponse.json(PORTFOLIO)
  }),
]
