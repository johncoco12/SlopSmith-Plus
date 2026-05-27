import { get, post, put } from '@/api/index'

export const fetchPlugins       = (): Promise<unknown>        => get('/api/plugins')
export const fetchStartupStatus = (): Promise<unknown>        => get('/api/startup-status')
export const checkPluginUpdates = (id: string): Promise<unknown> => get(`/api/plugins/${id}/updates`)
export const updatePlugin       = (id: string): Promise<unknown> => post(`/api/plugins/${id}/update`, {})
export const enablePlugin       = (id: string): Promise<unknown> => post(`/api/plugins/${encodeURIComponent(id)}/enable`, {})
export const disablePlugin      = (id: string): Promise<unknown> => post(`/api/plugins/${encodeURIComponent(id)}/disable`, {})
export const fetchProviders     = (): Promise<unknown>        => get('/api/plugins/providers')
export const setActiveProvider  = (type: string, name: string): Promise<unknown> =>
  put(`/api/plugins/providers/${encodeURIComponent(type)}/active`, { name })
