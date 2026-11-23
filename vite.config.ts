import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages では https://<user>.github.io/<repo>/ で公開されるため、
// ビルド時は base にリポジトリ名を入れる（BASE_PATH で上書き可）
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === 'build' || isPreview ? process.env.BASE_PATH ?? '/golf-compe/' : '/',
}));
