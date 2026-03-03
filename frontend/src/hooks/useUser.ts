import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/auth'

export function useUser() {
  const { isAuthenticated } = useAuthStore()

  const query = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await api.get('/auth/me')
      return response.data.user
    },
    enabled: isAuthenticated
  })

  return query
}
