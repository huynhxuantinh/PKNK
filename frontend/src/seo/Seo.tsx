import { useEffect } from 'react'

import { DEFAULT_SHARE_IMAGE, SITE_NAME, absoluteUrl, type SeoDefinition } from './seoConfig'

type JsonLd = Record<string, unknown> | Array<Record<string, unknown>>

interface SeoProps extends SeoDefinition {
  jsonLd?: JsonLd
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.content = content
}

export function Seo({ title, description, path, image = DEFAULT_SHARE_IMAGE, noIndex = false, jsonLd }: SeoProps) {
  useEffect(() => {
    const canonicalUrl = absoluteUrl(path)
    const imageUrl = absoluteUrl(image)
    document.documentElement.lang = 'vi'
    document.title = title

    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')
    upsertMeta('property', 'og:locale', 'vi_VN')
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', canonicalUrl)
    upsertMeta('property', 'og:image', imageUrl)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', imageUrl)

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = canonicalUrl

    const scriptId = 'page-json-ld'
    document.getElementById(scriptId)?.remove()
    if (jsonLd) {
      const script = document.createElement('script')
      script.id = scriptId
      script.type = 'application/ld+json'
      script.text = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }

    return () => document.getElementById(scriptId)?.remove()
  }, [description, image, jsonLd, noIndex, path, title])

  return null
}
