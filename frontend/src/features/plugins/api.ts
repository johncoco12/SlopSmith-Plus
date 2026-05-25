import { get, post } from '@/api/index'

export const fetchPlugins       = (): Promise<unknown>        => get('/api/plugins')
export const fetchStartupStatus = (): Promise<unknown>        => get('/api/startup-status')
export const checkPluginUpdates = (id: string): Promise<unknown> => get(`/api/plugins/${id}/updates`)
export const updatePlugin       = (id: string): Promise<unknown> => post(`/api/plugins/${id}/update`, {})
