import { useEffect, useState } from 'react'
import { api, apiBlob } from './api.js'

const blobs = new Map()

export function uploadIdOf(upload) {
  return typeof upload === 'object' && upload !== null ? upload._id : upload
}

function loadBlob(uploadId) {
  const key = String(uploadId)
  let promise = blobs.get(key)
  if (!promise) {
    promise = api(`/uploads/${key}/link`)
      .then((data) => apiBlob(data.url))
      .catch((error) => {
        blobs.delete(key)
        throw error
      })
    blobs.set(key, promise)
  }
  return promise
}

export function useMediaUrl(upload) {
  const uploadId = uploadIdOf(upload)
  const [result, setResult] = useState({ id: null, url: null })

  useEffect(() => {
    if (!uploadId) return undefined
    let cancelled = false
    let objectUrl = null
    loadBlob(uploadId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setResult({ id: uploadId, url: objectUrl })
      })
      .catch(() => { if (!cancelled) setResult({ id: uploadId, url: null }) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [uploadId])

  return uploadId && result.id === uploadId ? result.url : null
}
