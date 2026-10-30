import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../src/main/window', () => ({
  getMainWindow: () => null
}))

import { LogService } from '../src/main/services/log-service'

describe('LogService 保存日志', () => {
  it('把历史原始行写入文件', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'adb-tool-log-save-'))
    const file = join(dir, 'log.txt')
    const service = new LogService()
    ;(service as unknown as { history: string[] }).history = [
      '10-30 21:00:00.000 I/Tag( 1234): hello',
      '10-30 21:00:01.000 E/Tag( 1234): world'
    ]

    const result = await service.saveToFile(file)
    expect(result.lines).toBe(2)
    expect(await readFile(file, 'utf8')).toBe(
      '10-30 21:00:00.000 I/Tag( 1234): hello\n10-30 21:00:01.000 E/Tag( 1234): world\n'
    )
  })
})
