import client from './client'
import type { TaskStatus } from '@/types'

export const tasksApi = {
  getStatus: (taskId: string) => client.get<TaskStatus>(`/tasks/${taskId}/`),
}

/**
 * Poll a Celery task until it reaches a terminal state (SUCCESS or FAILURE).
 * Resolves with the final TaskStatus. Rejects after maxAttempts with a timeout error.
 */
export async function pollTask(
  taskId: string,
  intervalMs = 2000,
  maxAttempts = 30,
): Promise<TaskStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data } = await tasksApi.getStatus(taskId)
    if (data.status === 'SUCCESS' || data.status === 'FAILURE') {
      return data
    }
    await new Promise<void>((r) => setTimeout(r, intervalMs))
  }
  throw new Error('La actualización de precios tardó demasiado. Inténtalo de nuevo.')
}
