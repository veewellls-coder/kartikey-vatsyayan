const API_BASE = '/api';

export const api = {
  async get(path: string) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${res.statusText}`);
    }
    return res.json();
  },
  async request(path: string, method: string, data?: any) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${res.statusText}`);
    }
    return res.json();
  },
  async post(path: string, data: any) {
    return this.request(path, 'POST', data);
  },
  async put(path: string, data: any) {
    return this.request(path, 'PUT', data);
  },
  async delete(path: string) {
    return this.request(path, 'DELETE');
  }
};
