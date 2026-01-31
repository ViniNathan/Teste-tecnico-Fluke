import logger from '../utils/logger';
import { startWorker } from './worker';

startWorker().catch((err) => {
	logger.fatal({ error: err }, 'Worker failed to start');
	process.exit(1);
});
