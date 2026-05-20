import { get, post } from './index.js'

export const fetchPlugins      = ()   => get('/api/plugins')
export const fetchStartupStatus = ()   => get('/api/startup-status')
export const checkPluginUpdates = (id) => get(`/api/plugins/${id}/updates`)
export const updatePlugin       = (id) => post(`/api/plugins/${id}/update`, {})
