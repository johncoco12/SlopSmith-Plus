import { get, post, del } from './index.js'

export const fetchLoops = (filename) =>
  get(`/api/loops?filename=${encodeURIComponent(filename)}`)

export const saveLoop   = (data) => post('/api/loops', data)
export const deleteLoop = (id)   => del(`/api/loops/${id}`)
