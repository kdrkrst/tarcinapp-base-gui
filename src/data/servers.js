/**
 * OAS Servers Repository
 *
 * Sourced directly from oas.yml servers section.
 * Add custom entries or override URLs as needed.
 */

/** @type {{ url: string; description: string }[]} */
export const SERVERS = [
  {
    url: 'https://api.tarcinapp.com',
    description: 'Production Environment',
  },
  {
    url: 'http://localhost:8081',
    description: 'Local Development',
  },
]
