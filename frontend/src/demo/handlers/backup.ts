import { http, HttpResponse } from 'msw'
import { store } from '../store'

export const backupHandlers = [
  http.get('/api/backup/export/', () => {
    const backup = {
      assets: store.assets,
      accounts: store.accounts,
      transactions: store.transactions,
      dividends: store.dividends,
      interests: store.interests,
    }
    return new HttpResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="fintrack-demo-backup.json"',
      },
    })
  }),

  http.post('/api/backup/import/', () => {
    // In demo mode, ignore the import — just return success
    return HttpResponse.json({ message: 'Importación no disponible en modo demo.' }, { status: 200 })
  }),

  http.get('/api/export/transactions.csv', () => {
    const header = 'fecha,tipo,activo,ticker,cuenta,cantidad,precio,comision,impuesto,notas'
    const rows = store.transactions.map((t) =>
      [t.date, t.type, t.asset_name, t.asset_ticker ?? '', t.account_name,
       t.quantity, t.price ?? '', t.commission, t.tax, t.notes].join(',')
    )
    const csv = [header, ...rows].join('\n')
    return new HttpResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="transacciones-demo.csv"',
      },
    })
  }),

  http.get('/api/export/dividends.csv', () => {
    const header = 'fecha,activo,ticker,acciones,bruto,impuesto,neto,retencion'
    const rows = store.dividends.map((d) =>
      [d.date, d.asset_name, d.asset_ticker ?? '', d.shares ?? '',
       d.gross, d.tax, d.net, d.withholding_rate ?? ''].join(',')
    )
    const csv = [header, ...rows].join('\n')
    return new HttpResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="dividendos-demo.csv"',
      },
    })
  }),

  http.get('/api/export/interests.csv', () => {
    const header = 'fecha,cuenta,bruto,neto,saldo,tasa_anual'
    const rows = store.interests.map((i) =>
      [i.date, i.account_name, i.gross, i.net,
       i.balance ?? '', i.annual_rate ?? ''].join(',')
    )
    const csv = [header, ...rows].join('\n')
    return new HttpResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="intereses-demo.csv"',
      },
    })
  }),
]
