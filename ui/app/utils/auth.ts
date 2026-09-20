export const API_BASE_URL = ''

export interface LoginResult {
    ok: boolean
    message: string
    payload: any
}

const DEV_BYPASS_KEY = 'devBypassEnabled'
const DEV_BYPASS_USERNAME = 'developer'

const SUCCESS_CODES = new Set([0, 200, '0', '200'])

const pickMessage = (payload: any): string => {
    if (!payload || typeof payload !== 'object') {
        return ''
    }

    return (
        payload.msg ||
        payload.message ||
        payload.error ||
        payload.data?.msg ||
        payload.data?.message ||
        ''
    )
}

const hasExplicitFailure = (payload: any): boolean => {
    if (!payload || typeof payload !== 'object') {
        return false
    }

    if ('success' in payload && payload.success === false) {
        return true
    }

    if ('code' in payload && !SUCCESS_CODES.has(payload.code)) {
        return true
    }

    if ('status' in payload && typeof payload.status === 'string') {
        const status = payload.status.toLowerCase()
        if (status === 'fail' || status === 'failed' || status === 'error') {
            return true
        }
    }

    return false
}

const isSuccessPayload = (payload: any): boolean => {
    if (!payload || typeof payload !== 'object') {
        return false
    }

    if ('success' in payload && payload.success === true) {
        return true
    }

    if ('code' in payload && SUCCESS_CODES.has(payload.code)) {
        return true
    }

    if ('status' in payload) {
        if (payload.status === 200 || payload.status === '200') {
            return true
        }
        if (typeof payload.status === 'string') {
            const status = payload.status.toLowerCase()
            if (status === 'ok' || status === 'success') {
                return true
            }
        }
    }

    if (payload.data && typeof payload.data === 'object') {
        if ('success' in payload.data && payload.data.success === true) {
            return true
        }
        if ('code' in payload.data && SUCCESS_CODES.has(payload.data.code)) {
            return true
        }
    }

    return false
}

const extractToken = (payload: any): string => {
    if (!payload || typeof payload !== 'object') {
        return ''
    }

    return (
        payload.token ||
        payload.accessToken ||
        payload.access_token ||
        payload.data?.token ||
        payload.data?.accessToken ||
        payload.data?.access_token ||
        ''
    )
}

export const loginWithPassword = async (username: string, password: string): Promise<LoginResult> => {
    const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userName: username, password }),
    })

    let payload: any = null
    try {
        payload = await response.json()
    } catch {
        payload = null
    }

    if (!response.ok) {
        const message = pickMessage(payload) || `登录失败 (HTTP ${response.status})`
        return { ok: false, message, payload }
    }

    if (payload && hasExplicitFailure(payload)) {
        const message = pickMessage(payload) || '用户名或密码错误'
        return { ok: false, message, payload }
    }

    const success = isSuccessPayload(payload)
    if (!payload || success) {
        const message = pickMessage(payload) || '登录成功'
        return { ok: true, message, payload }
    }

    return {
        ok: false,
        message: pickMessage(payload) || '登录失败：后端未返回成功状态',
        payload,
    }
}

export const persistLoginState = (username: string, payload?: any) => {
    localStorage.setItem('username', username)
    localStorage.setItem('isLoggedIn', 'true')

    const token = extractToken(payload)
    if (token) {
        localStorage.setItem('authToken', token)
    }
}

export const clearLoginState = () => {
    localStorage.removeItem('username')
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('authToken')
}

export const canUseDevBypass = (): boolean => {
    if (typeof import.meta === 'undefined') {
        return false
    }

    const env = (import.meta as any).env || {}
    return env.VITE_ENABLE_DEV_BYPASS === 'true' || env.DEV === true
}

export const isDevBypassEnabled = (): boolean => {
    if (!canUseDevBypass()) {
        return false
    }

    return localStorage.getItem(DEV_BYPASS_KEY) === 'true'
}

export const setDevBypassEnabled = (enabled: boolean) => {
    if (!canUseDevBypass()) {
        return
    }

    if (enabled) {
        localStorage.setItem(DEV_BYPASS_KEY, 'true')
        persistLoginState(DEV_BYPASS_USERNAME, { token: 'dev-bypass-token' })
        return
    }

    localStorage.removeItem(DEV_BYPASS_KEY)
    if (localStorage.getItem('username') === DEV_BYPASS_USERNAME) {
        clearLoginState()
    }
}
