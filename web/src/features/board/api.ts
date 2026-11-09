import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { BoardData } from './types'

export interface BoardApi {
  /** GET /api/board */
  board(): Promise<BoardData>
}

export function createBoardApi(_client: HttpClient): BoardApi {
  return {
    board: () => {
      throw new Error('TODO')
    },
  }
}

export const boardApi: BoardApi = createBoardApi(defaultHttp)
