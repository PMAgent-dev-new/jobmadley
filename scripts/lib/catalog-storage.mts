const DEFAULT_BUCKET = 'meta-catalog'
const PAGE_SIZE = 1_000

export type CatalogStorageObject = {
  pathname: string
  url: string
  size?: number
  contentType?: string
  updatedAt?: string
  isDirectory: boolean
}

export type PutCatalogObjectOptions = {
  contentType: string
  upsert: boolean
  cacheControl?: number
}

type SupabaseListItem = {
  id?: string | null
  name?: string
  updated_at?: string
  metadata?: { size?: number; mimetype?: string } | null
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function normalizeCatalogObjectPath(value: string): string {
  const normalized = String(value || '').replace(/^\/+|\/+$/g, '')
  const segments = normalized.split('/')
  if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
    throw new Error(`不正なStorageパスです: ${value}`)
  }
  return segments.join('/')
}

function encodePath(value: string): string {
  return normalizeCatalogObjectPath(value).split('/').map(encodeURIComponent).join('/')
}

function encodeDirectory(value: string): string {
  const normalized = String(value || '').replace(/^\/+|\/+$/g, '')
  if (!normalized) return ''
  return normalizeCatalogObjectPath(normalized)
}

function joinPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name
}

async function responseError(response: Response, label: string): Promise<Error> {
  let detail = ''
  try {
    detail = (await response.text()).slice(0, 500)
  } catch {
    // HTTP statusだけを残す。
  }
  return new Error(`${label}: HTTP ${response.status}${detail ? ` ${detail}` : ''}`)
}

export class SupabaseCatalogStorage {
  readonly url: string
  readonly serviceRoleKey: string
  readonly bucket: string

  constructor(config: { url: string; serviceRoleKey: string; bucket?: string }) {
    this.url = stripTrailingSlash(config.url)
    this.serviceRoleKey = config.serviceRoleKey.trim()
    this.bucket = String(config.bucket || DEFAULT_BUCKET).trim()
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(this.url)) {
      throw new Error('SUPABASE_URLが正しいSupabase project URLではありません')
    }
    if (!this.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEYがありません')
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(this.bucket)) throw new Error('CATALOG_STORAGE_BUCKETが不正です')
  }

  private authHeaders(extra?: Record<string, string>): HeadersInit {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      ...extra,
    }
  }

  publicUrl(pathname: string): string {
    return `${this.url}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${encodePath(pathname)}`
  }

  async listDirectory(directory: string, search?: string): Promise<CatalogStorageObject[]> {
    const prefix = encodeDirectory(directory)
    const found: CatalogStorageObject[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const response = await fetch(`${this.url}/storage/v1/object/list/${encodeURIComponent(this.bucket)}`, {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prefix,
          limit: PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' },
          ...(search ? { search } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw await responseError(response, `Storage一覧取得失敗: ${prefix || '/'}`)
      const page = await response.json() as SupabaseListItem[]
      for (const item of page) {
        if (!item.name) continue
        const pathname = joinPath(prefix, item.name)
        found.push({
          pathname,
          url: this.publicUrl(pathname),
          size: Number.isFinite(Number(item.metadata?.size)) ? Number(item.metadata?.size) : undefined,
          contentType: item.metadata?.mimetype,
          updatedAt: item.updated_at,
          isDirectory: !item.id,
        })
      }
      if (page.length < PAGE_SIZE) return found
    }
  }

  async find(pathname: string): Promise<CatalogStorageObject | undefined> {
    const path = normalizeCatalogObjectPath(pathname)
    const lastSlash = path.lastIndexOf('/')
    const directory = lastSlash >= 0 ? path.slice(0, lastSlash) : ''
    const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
    const entries = await this.listDirectory(directory, filename)
    return entries.find((entry) => !entry.isDirectory && entry.pathname === path)
  }

  async read(pathname: string): Promise<Buffer> {
    const path = normalizeCatalogObjectPath(pathname)
    const response = await fetch(
      `${this.url}/storage/v1/object/authenticated/${encodeURIComponent(this.bucket)}/${encodePath(path)}`,
      {
        headers: this.authHeaders(),
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!response.ok) throw await responseError(response, `Storage取得失敗: ${path}`)
    return Buffer.from(await response.arrayBuffer())
  }

  async readPublic(pathname: string): Promise<Buffer> {
    const path = normalizeCatalogObjectPath(pathname)
    const response = await fetch(`${this.publicUrl(path)}?catalog_verify=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw await responseError(response, `Storage公開URL取得失敗: ${path}`)
    return Buffer.from(await response.arrayBuffer())
  }

  async put(
    pathname: string,
    data: Buffer | Uint8Array | string,
    options: PutCatalogObjectOptions,
  ): Promise<CatalogStorageObject> {
    const path = normalizeCatalogObjectPath(pathname)
    const body = typeof data === 'string' ? data : new Uint8Array(data)
    const response = await fetch(
      `${this.url}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodePath(path)}`,
      {
        method: 'POST',
        headers: this.authHeaders({
          'Content-Type': options.contentType,
          'cache-control': `max-age=${Math.max(0, options.cacheControl ?? 0)}`,
          'x-upsert': options.upsert ? 'true' : 'false',
        }),
        body,
        signal: AbortSignal.timeout(60_000),
      },
    )
    if (!response.ok) throw await responseError(response, `Storage保存失敗: ${path}`)
    return {
      pathname: path,
      url: this.publicUrl(path),
      size: typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength,
      contentType: options.contentType,
      updatedAt: new Date().toISOString(),
      isDirectory: false,
    }
  }

  async copy(
    sourcePathname: string,
    destinationPathname: string,
    options: PutCatalogObjectOptions,
  ): Promise<CatalogStorageObject> {
    const source = await this.read(sourcePathname)
    return this.put(destinationPathname, source, options)
  }

  async remove(pathnames: string[]): Promise<void> {
    const prefixes = [...new Set(pathnames.map(normalizeCatalogObjectPath))]
    if (!prefixes.length) return
    const response = await fetch(`${this.url}/storage/v1/object/${encodeURIComponent(this.bucket)}`, {
      method: 'DELETE',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw await responseError(response, `Storage削除失敗: ${prefixes.length}件`)
  }
}

export function catalogStorageFromEnv(options: { required?: boolean } = {}): SupabaseCatalogStorage | undefined {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) {
    if (options.required) {
      throw new Error('SUPABASE_URLとSUPABASE_SERVICE_ROLE_KEYが必要です')
    }
    return undefined
  }
  return new SupabaseCatalogStorage({
    url,
    serviceRoleKey,
    bucket: process.env.CATALOG_STORAGE_BUCKET || DEFAULT_BUCKET,
  })
}
