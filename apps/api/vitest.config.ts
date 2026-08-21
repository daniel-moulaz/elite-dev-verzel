import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    setupFiles: ['./tests/setup-env.ts'],
    // Toda a suíte é de integração contra um PostgreSQL real, com streams SSE
    // e testes que observam locks. O padrão de 5s coincidia com os próprios
    // guards internos dos testes: o vitest matava o caso antes de o guard
    // reportar a causa, e as requisições órfãs do timeout ainda colidiam com a
    // limpeza do teste seguinte. A folga mantém os guards como a primeira
    // falha e preserva mensagens de erro úteis.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
