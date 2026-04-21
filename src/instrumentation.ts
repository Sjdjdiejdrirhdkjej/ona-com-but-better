import { setupGracefulShutdown } from './libs/GracefulShutdown';

export async function register() {
  setupGracefulShutdown();
}
