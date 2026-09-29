import { Router } from 'express'

export function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve()
    .then(() => handler(request, response, next))
    .catch(next)
}

export function createAsyncRouter() {
  const router = Router()
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const register = router[method].bind(router)
    router[method] = (path, ...handlers) => register(path, ...handlers.map(asyncRoute))
  }
  return router
}
