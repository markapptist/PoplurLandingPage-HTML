import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanSource, sourceFromSearch } from './visitSource.ts'

test('keeps an outreach tag as a short lowercase slug', () => {
  assert.equal(cleanSource('tmu-poster-library'), 'tmu-poster-library')
  assert.equal(cleanSource('  Club-TMU-Photo '), 'club-tmu-photo')
  assert.equal(cleanSource('reddit_uoft.1'), 'reddit_uoft.1')
})

test('drops anything that is not a slug character and caps the length', () => {
  assert.equal(cleanSource('<script>x</script>'), 'scriptxscript')
  assert.equal(cleanSource('a b/c?d=e'), 'abcde')
  assert.equal(cleanSource('x'.repeat(60)), 'x'.repeat(40))
})

test('no tag means null', () => {
  assert.equal(cleanSource(''), null)
  assert.equal(cleanSource('   '), null)
  assert.equal(cleanSource('!!!'), null)
  assert.equal(cleanSource(undefined), null)
  assert.equal(cleanSource(42), null)
})

test('reads src first, then utm_source, from a query string', () => {
  assert.equal(sourceFromSearch('?src=tmu-cafe-pilot'), 'tmu-cafe-pilot')
  assert.equal(sourceFromSearch('?utm_source=TikTok'), 'tiktok')
  assert.equal(sourceFromSearch('?src=poster-a&utm_source=tiktok'), 'poster-a')
  assert.equal(sourceFromSearch('?pop=abc'), null)
  assert.equal(sourceFromSearch(''), null)
})
