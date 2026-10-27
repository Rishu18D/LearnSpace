const configuredBase = import.meta.env.VITE_API_BASE_URL;
const BASE = (configuredBase
  ? (/^https?:\/\//i.test(configuredBase) || configuredBase.startsWith("/")
    ? configuredBase
    : `https://${configuredBase}`)
  : "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status = 0, code = "API_ERROR", details = undefined, payload = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.payload = payload;
  }
}

async function send(path, options) {
  try {
    return await fetch(`${BASE}${path}`, { ...options, credentials: "include" });
  } catch {
    throw new ApiError("Cannot reach the backend. Make sure the API Gateway is running.", 0, "NETWORK_ERROR");
  }
}

let refreshPromise;
async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = send("/auth/refresh", {
      method: "POST",
      headers: { Accept: "application/json" }
    }).then(async response => {
      if (response.status === 401) {
        localStorage.removeItem("slp_access_token");
        localStorage.removeItem("slp_user");
        window.dispatchEvent(new Event("slp:session-expired"));
        throw new ApiError("Your session expired. Please sign in again.", response.status, "SESSION_EXPIRED");
      }
      if (!response.ok) {
        throw new ApiError("Unable to renew your session. Please try again.", response.status, "SESSION_REFRESH_FAILED");
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new ApiError("The backend returned an invalid session.", response.status, "INVALID_RESPONSE");
      }
      if (typeof payload?.accessToken !== "string") {
        throw new ApiError("The backend returned an invalid session.", response.status, "INVALID_RESPONSE");
      }
      localStorage.setItem("slp_access_token", payload.accessToken);
      return payload;
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api(path, options = {}) {
  const token = options.token === null
    ? null
    : options.token || localStorage.getItem("slp_access_token");
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  const requestOptions = {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  };

  let response = await send(path, requestOptions);
  const canRefresh = options.token !== null && !/\/auth\/(login|register|refresh|logout)$/.test(path);
  if (response.status === 401 && canRefresh) {
    const refreshed = await refreshAccessToken();
    headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
    response = await send(path, requestOptions);
  }

  if (response.status === 204) return null;
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new ApiError("The backend returned an invalid response.", response.status, "INVALID_RESPONSE");
  }
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || payload?.message || `Request failed (${response.status})`,
      response.status,
      payload?.error?.code,
      payload?.error?.details,
      payload
    );
  }
  return payload;
}

export const authApi = {
  register: data => api("/auth/register", { method: "POST", body: data, token: null }),
  login: data => api("/auth/login", { method: "POST", body: data, token: null }),
  me: () => api("/auth/me"),
  logout: () => api("/auth/logout", { method: "POST" })
};
export const courseApi = {
  list: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value !== undefined && value !== null) query.set(key, value);
    });
    return api(`/courses${query.size ? `?${query}` : ""}`, { token: null });
  },
  get: id => api(`/courses/${encodeURIComponent(id)}`),
  mine: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value !== undefined && value !== null) query.set(key, value);
    });
    return api(`/courses/manage/mine${query.size ? `?${query}` : ""}`);
  },
  create: data => api("/courses", { method: "POST", body: data }),
  update: (id, data) => api(`/courses/${id}`, { method: "PATCH", body: data }),
  remove: id => api(`/courses/${id}`, { method: "DELETE" }),
  duplicate: id => api(`/courses/${id}/duplicate`, { method: "POST", body: {} }),
  importCourses: (courses, dryRun = true) => api("/courses/manage/import", { method: "POST", body: { courses, dryRun } }),
  quiz: (courseId, quizId) => api(`/courses/${courseId}/quizzes/${quizId}`),
  submitQuiz: (courseId, quizId, answers) => api(`/courses/${courseId}/quizzes/${quizId}/attempts`, { method: "POST", body: { answers } }),
  quizAttempts: (courseId, quizId) => api(`/courses/${courseId}/quizzes/${quizId}/attempts/me`),
  pendingAssessments: courseId => api(`/courses/${courseId}/attempts/pending`),
  reviewAssessment: (courseId, quizId, attemptId, grades) => api(`/courses/${courseId}/quizzes/${quizId}/attempts/${attemptId}/review`, {
    method: "PATCH",
    body: { grades }
  })
};
export const studentApi = {
  me: () => api("/students/me"),
  create: data => api("/students", { method: "POST", body: data }),
  update: data => api("/students/me", { method: "PATCH", body: data })
};
export const enrollmentApi = {
  mine: () => api("/enrollments/me?limit=100"),
  enroll: courseId => api("/enrollments", { method: "POST", body: { courseId } }),
  cancel: id => api(`/enrollments/${id}`, { method: "PATCH", body: { status: "cancelled" } })
};
export const progressApi = {
  mine: () => api("/progress/me"),
  course: id => api(`/progress/courses/${id}`),
  access: (courseId, lessonId) => api(`/progress/courses/${courseId}/lessons/${encodeURIComponent(lessonId)}/access`, {
    method: "POST",
    body: {}
  }),
  complete: (lessonId, courseId) => api(`/progress/lessons/${encodeURIComponent(lessonId)}/complete`, {
    method: "POST",
    body: { courseId }
  })
};
export const notificationApi = {
  list: () => api("/notifications?limit=100"),
  read: id => api(`/notifications/${id}/read`, { method: "PATCH" })
};
export const analyticsApi = {
  student: () => api("/analytics/student"),
  instructor: () => api("/analytics/instructor")
};
