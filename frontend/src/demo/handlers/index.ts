import { authHandlers } from './auth'
import { assetHandlers } from './assets'
import { accountHandlers } from './accounts'
import { transactionHandlers } from './transactions'
import { dividendHandlers } from './dividends'
import { interestHandlers } from './interests'
import { portfolioHandlers } from './portfolio'
import { reportHandlers } from './reports'
import { settingsHandlers } from './settings'
import { backupHandlers } from './backup'

export const handlers = [
  ...authHandlers,
  ...assetHandlers,
  ...accountHandlers,
  ...transactionHandlers,
  ...dividendHandlers,
  ...interestHandlers,
  ...portfolioHandlers,
  ...reportHandlers,
  ...settingsHandlers,
  ...backupHandlers,
]
