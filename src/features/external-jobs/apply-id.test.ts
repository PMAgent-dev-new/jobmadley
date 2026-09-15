import { describe, expect, it } from 'vitest'

import { externalApplyId, parseExternalApplyId } from './apply-id'

describe('external apply id', () => {
  it('parses both the internal hw-prefixed id and the public raw catalog id', () => {
    expect(parseExternalApplyId('hw-13010-12345678')).toEqual({
      source: 'hellowork',
      sourceId: '13010-12345678',
    })
    expect(parseExternalApplyId('13010-12345678')).toEqual({
      source: 'hellowork',
      sourceId: '13010-12345678',
    })
  })

  it('keeps ordinary owned-job ids outside the external verification path', () => {
    expect(parseExternalApplyId('zbwa0y7xf')).toBeNull()
    expect(externalApplyId('hellowork', '13010-12345678')).toBe('hw-13010-12345678')
  })
})
