import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { BoardData } from './types'

export interface BoardApi {
  /** GET /api/board */
  board(): Promise<BoardData>
}

export function createBoardApi(client: HttpClient): BoardApi {
  return {
    board: () => client.get<BoardData>('/api/board'),
  }
}

export const boardApi: BoardApi = createBoardApi(defaultHttp)
