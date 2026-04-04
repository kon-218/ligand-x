/**
 * Job utility functions for common job operations across stores
 */

/**
 * Merge incoming jobs with local pending/running jobs to preserve UI state
 *
 * This prevents jobs that were submitted locally but haven't synced yet from
 * disappearing when the backend hasn't acknowledged them. Keeps local jobs
 * that are pending/running and aren't in the incoming data.
 *
 * @param currentJobs - Jobs currently in the store
 * @param incomingJobs - Jobs from the backend/server
 * @param isRunningStatus - Function to determine if a job status is "running"
 * @returns Merged array with incoming jobs + local-only running jobs
 */
export function mergeJobs<T extends { job_id: string; status: string }>(
  currentJobs: T[],
  incomingJobs: T[],
  isRunningStatus: (status: string) => boolean
): T[] {
  const incomingJobsMap = new Map(incomingJobs.map(job => [job.job_id, job]))

  const localOnlyJobs = currentJobs.filter(job => {
    const isLocalOnly = !incomingJobsMap.has(job.job_id)
    const isRunning = isRunningStatus(job.status)
    return isLocalOnly && isRunning
  })

  return [...incomingJobs, ...localOnlyJobs]
}
