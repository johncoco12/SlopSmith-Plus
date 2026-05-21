import { get, post, del } from './index'

export const fetchLoops = (filename: string): Promise<unknown> =>
  get(`/api/loops?filename=${encodeURIComponent(filename)}`)

export const saveLoop   = (data: unknown): Promise<unknown> => post('/api/loops', data)
export const deleteLoop = (id: number): Promise<unknown>    => del(`/api/loops/${id}`)
