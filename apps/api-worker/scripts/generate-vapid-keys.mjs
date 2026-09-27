#!/usr/bin/env node
// Web Push の VAPID 鍵（P-256）を作り、wrangler secret / .dev.vars に入れる形で出力する。
//
//   node scripts/generate-vapid-keys.mjs
//
// 鍵を作り直すと、既存の購読はすべて使えなくなる（ブラウザ側で購読し直しが必要）。
import { generateKeyPairSync } from 'node:crypto'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = privateKey.export({ format: 'jwk' })
// 公開鍵は非圧縮形式（0x04 || x || y）。ブラウザの applicationServerKey にそのまま渡せる
const raw = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x, 'base64url'),
  Buffer.from(jwk.y, 'base64url'),
])
console.log(`VAPID_PUBLIC_KEY=${raw.toString('base64url')}`)
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`)
