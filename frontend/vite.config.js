import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { playwright } from '@vitest/browser-playwright';
// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    esbuild: {
        loader: 'jsx',
        include: /src\/.*\.jsx?$/,
        exclude: [],
    },
    // @ts-expect-error - vitest types
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        // Browser testing configuration - only enabled when --browser flag is used
        browser: {
            enabled: true,
            provider: playwright(),
            instances: [
                {
                    browser: 'chromium',
                },
            ],
        },
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidml0ZS5jb25maWcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2aXRlLmNvbmZpZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sTUFBTSxDQUFBO0FBQ25DLE9BQU8sS0FBSyxNQUFNLHNCQUFzQixDQUFBO0FBQ3hDLE9BQU8sSUFBSSxNQUFNLE1BQU0sQ0FBQTtBQUN2QixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNEJBQTRCLENBQUE7QUFFdkQsMkJBQTJCO0FBQzNCLGVBQWUsWUFBWSxDQUFDO0lBQzFCLE9BQU8sRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ2xCLE9BQU8sRUFBRTtRQUNQLEtBQUssRUFBRTtZQUNMLEdBQUcsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUM7U0FDdEM7S0FDRjtJQUNELE9BQU8sRUFBRTtRQUNQLE1BQU0sRUFBRSxLQUFLO1FBQ2IsT0FBTyxFQUFFLGdCQUFnQjtRQUN6QixPQUFPLEVBQUUsRUFBRTtLQUNaO0lBQ0Qsa0NBQWtDO0lBQ2xDLElBQUksRUFBRTtRQUNKLE9BQU8sRUFBRSxJQUFJO1FBQ2IsV0FBVyxFQUFFLE9BQU87UUFDcEIsVUFBVSxFQUFFLHFCQUFxQjtRQUNqQywyRUFBMkU7UUFDM0UsT0FBTyxFQUFFO1lBQ1AsT0FBTyxFQUFFLElBQUk7WUFDYixRQUFRLEVBQUUsVUFBVSxFQUFFO1lBQ3RCLFNBQVMsRUFBRTtnQkFDVDtvQkFDRSxPQUFPLEVBQUUsVUFBVTtpQkFDcEI7YUFDRjtTQUNGO0tBQ0Y7Q0FDRixDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCdcbmltcG9ydCB7IHBsYXl3cmlnaHQgfSBmcm9tICdAdml0ZXN0L2Jyb3dzZXItcGxheXdyaWdodCdcblxuLy8gaHR0cHM6Ly92aXRlLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKSxcbiAgICB9LFxuICB9LFxuICBlc2J1aWxkOiB7XG4gICAgbG9hZGVyOiAnanN4JyxcbiAgICBpbmNsdWRlOiAvc3JjXFwvLipcXC5qc3g/JC8sXG4gICAgZXhjbHVkZTogW10sXG4gIH0sXG4gIC8vIEB0cy1leHBlY3QtZXJyb3IgLSB2aXRlc3QgdHlwZXNcbiAgdGVzdDoge1xuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgZW52aXJvbm1lbnQ6ICdqc2RvbScsXG4gICAgc2V0dXBGaWxlczogJy4vc3JjL3Rlc3Qvc2V0dXAudHMnLFxuICAgIC8vIEJyb3dzZXIgdGVzdGluZyBjb25maWd1cmF0aW9uIC0gb25seSBlbmFibGVkIHdoZW4gLS1icm93c2VyIGZsYWcgaXMgdXNlZFxuICAgIGJyb3dzZXI6IHtcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBwcm92aWRlcjogcGxheXdyaWdodCgpLFxuICAgICAgaW5zdGFuY2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBicm93c2VyOiAnY2hyb21pdW0nLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9LFxuICB9LFxufSlcbiJdfQ==