/**
 * User & Token Repository
 *
 * Add, remove, or edit users here. Each user has:
 *   - id:          unique string identifier
 *   - name:        display name shown in the UI
 *   - token:       Bearer token sent in Authorization header (null = no auth)
 *   - description: free-text description of this user's roles / purpose
 */

/** @type {import('../types').AppUser[]} */
export const USERS = [
  {
    id: 'no-auth',
    name: 'No Authentication',
    token: null,
    description: 'Calls are made without any Authorization header. Useful for public endpoints.',
  },
  {
    id: 'admin',
    name: 'Admin User',
    token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.REPLACE_WITH_REAL_ADMIN_TOKEN',
    description: 'Full administrative access. Can read and write all record types.',
  },
  {
    id: 'readonly',
    name: 'Read-Only User',
    token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.REPLACE_WITH_REAL_READONLY_TOKEN',
    description: 'Can only perform GET requests. Write operations will be rejected by the backend.',
  },
  {
    id: 'member',
    name: 'Member User',
    token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE4NTkzODgxNTYsImlhdCI6MTc1OTM4ODE1NiwianRpIjoiZjhmODExZWQtZmVlYy00NDRkLTlkNTQtMmVhOWQ2ZjIzNGRkIiwiaXNzIjoidGFyY2luYXBwLWlkbSIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJkZWZhdWx0LXVzZXItaWQiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJwb3N0bWFuIiwic2Vzc2lvbl9zdGF0ZSI6ImE1OGUyNDFiLWE2ZjItNDMzNy1hZGQyLWU3MzlmNzM2ZDU1OCIsImFjciI6IjEiLCJhbGxvd2VkLW9yaWdpbnMiOlsiLyoiXSwicmVhbG1fYWNjZXNzIjp7InJvbGVzIjpbInRhcmNpbmFwcC5tZW1iZXIiLCJkZWZhdWx0LXJvbGVzLXRhcmNpbmFwcCIsIm9mZmxpbmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbIm1hbmFnZS1hY2NvdW50IiwibWFuYWdlLWFjY291bnQtbGlua3MiLCJ2aWV3LXByb2ZpbGUiXX19LCJncm91cHMiOlsiZGVmYXVsdC11c2VyLWdyb3VwIl0sInNjb3BlIjoib3BlbmlkIGVtYWlsIHByb2ZpbGUiLCJzaWQiOiJhNThlMjQxYi1hNmYyLTQzMzctYWRkMi1lNzM5ZjczNmQ1NTgiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicm9sZXMiOlsidGFyY2luYXBwLm1lbWJlciIsImRlZmF1bHQtcm9sZXMtdGFyY2luYXBwIiwib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiJdLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJ1c2VyLWJhc2ljLXZlcmlmaWVkLW1lbWJlci0xIiwiZ2l2ZW5fbmFtZSI6IiIsImZhbWlseV9uYW1lIjoiIn0.kC4DAqHeEFIPfi5ap8HWSIwtZWZdh1YzhIk6sw4iBTwtLYm8nG7ypjJD2GeOpc-yctQw-2LTEA7x1EFoxmZYLhC8YEYEKq7weSsnVicoyet77t805sHWFIsroSaqYFeVFTIWUl2OWS0cWUCJeAkpoaKLFA9vu_2QrMMo0w-I-JJSgLWOvCat3HvHuFlNkWb_Zw0cb8SHFmMkodnljVUf_AXdr1wjEOtVDJFDxiVUHZ9GIc-bFvh4O_q0FuoKLhhfgVKi4vEWYBJITHBLIbYQj7bAD_lcSF-bQVFt9pIeUmo7KMJj1NKi5kC1LmkjfU8um4zdF43Bwf60bZfRoi1oXg',
    description: 'Regular authenticated member. Sees only public and own records.',
  },
]
